/**
 * POST /api/studio/chats/[id]/generate
 *
 * Lifecycle:
 *   1. validate chat ownership + model + ref assets + parentMessageId scope
 *   2. resolve conversational mode (multiTurn history vs auto-chain ref vs 400)
 *   3. reserve quota (atomic UPDATE … WHERE)
 *   4. insert user message (prompt + refs + parentMessageId)
 *   5. insert assistant message in 'pending' status
 *   6. fetch ref-asset bytes from storage (i2i path)
 *   7. call upstream gateway
 *   8. on success: write each generated image to storage + assets;
 *      update assistant.outputAssetIds + status=completed;
 *      record usage + activity;
 *      fire-and-forget moodboard cover hint if moodboardId supplied
 *   9. on failure: refund quota; mark assistant status=failed
 *
 * Soft-degrading behavior surfaces via top-level `warnings: string[]`
 * (e.g. `skippedRefs:N`, `autoAppendedRefFromHistory`).
 *
 * Returns the assistant message with publicUrl for each output asset.
 */
import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { assets } from '@/lib/db/schema';
import {
  completeAssistantMessage,
  createPendingAssistantMessage,
  failAssistantMessage,
  getAssetsByIdsForWorkspace,
  getChatForWorkspace,
  getFirstOutputAssetOfLatestCompletedAssistant,
  getMessageByIdForChat,
  getRecentChatMessagesForContext,
  recordUsage,
  recordUserMessage,
  refundQuota,
  reserveQuota,
  touchChat,
} from '@/lib/db/studio-queries';
import { getMoodboardById, setCoverIfMissing } from '@/lib/db/moodboard-queries';
import { insertAsset } from '@/lib/db/asset-queries';
import { getStorage } from '@/lib/storage';
import { getModel, type ModelCapabilities } from '@/lib/studio/models';
import {
  generate,
  UpstreamError,
  type UpstreamInputImage,
} from '@/lib/studio/upstream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Image generation can take 30+ seconds; bump the default 10s budget.
export const maxDuration = 120;

const refRoleSchema = z.enum(['content', 'style', 'character']);
const refsSchema = z
  .array(
    z.object({
      asset_id: z.string().uuid(),
      role: refRoleSchema,
    }),
  )
  .max(8)
  .optional();

const generateSchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z.string().min(1).max(100),
  n: z.number().int().min(1).max(8).default(1),
  size: z.string().max(20).optional(),
  aspectRatio: z.string().max(10).optional(),
  quality: z.enum(['low', 'medium', 'high', 'auto']).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  refs: refsSchema,
  conversational: z.boolean().optional(),
  parentMessageId: z.string().uuid().optional(),
  seed: z.number().int().optional(),
  transparentBackground: z.boolean().optional(),
  moodboardId: z.string().uuid().optional(),
});

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user || !ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const { id: chatId } = await ctx.params;
  const chat = await getChatForWorkspace(chatId, ws.id);
  if (!chat) return NextResponse.json({ error: 'chat not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const model = getModel(input.model);
  if (!model) {
    return NextResponse.json(
      { error: 'unknown_model', model: input.model },
      { status: 400 },
    );
  }
  const n = Math.min(input.n, model.maxN);

  // Capability gating — fail-fast before quota reserve / DB writes / upstream call.
  const capChecks: Array<{ field: string; cap: keyof ModelCapabilities; condition: boolean }> = [
    { field: 'seed', cap: 'seed', condition: input.seed !== undefined },
    {
      field: 'transparentBackground',
      cap: 'transparentBackground',
      condition: !!input.transparentBackground,
    },
    {
      field: 'character',
      cap: 'multiTurn',
      condition: !!input.refs?.some((r) => r.role === 'character'),
    },
  ];
  for (const c of capChecks) {
    if (c.condition && !model.capabilities[c.cap]) {
      return NextResponse.json(
        {
          error: 'capability_unsupported',
          cap: c.cap,
          model: input.model,
          field: c.field,
        },
        { status: 400 },
      );
    }
  }

  // Any refs at all require imageInput capability.
  if (input.refs?.length && !model.capabilities.imageInput) {
    return NextResponse.json(
      {
        error: 'capability_unsupported',
        cap: 'imageInput',
        model: input.model,
        field: 'refs',
      },
      { status: 400 },
    );
  }

  // parentMessageId 必须属于本 chat — 防止跨 chat 伪造 lineage。
  if (input.parentMessageId) {
    const parent = await getMessageByIdForChat(input.parentMessageId, chat.id);
    if (!parent) {
      return NextResponse.json(
        {
          error: 'parent_message_not_in_chat',
          parentMessageId: input.parentMessageId,
        },
        { status: 400 },
      );
    }
  }

  // ── Conversational mode (spec §4.1) ──
  // Path I: multiTurn model → pull history into upstream messages[].
  // Path II: non-multiTurn but imageInput model → auto-append previous output
  //          as a content ref and warn.
  // Path III: neither → 400 capability_unsupported.
  const warnings: string[] = [];
  let historyMessages:
    | Array<{ role: 'user' | 'assistant'; text?: string; imageDataUrls?: string[] }>
    | undefined;
  // Local copy of refs we may augment for the upstream path.
  let effectiveRefs = input.refs ?? [];

  if (input.conversational === true) {
    if (model.capabilities.multiTurn) {
      const history = await getRecentChatMessagesForContext(chat.id, 8);
      historyMessages = history.map((m) => ({
        role: m.role,
        text: m.text ?? undefined,
      }));
    } else if (model.capabilities.imageInput) {
      const sourceAssetId =
        await getFirstOutputAssetOfLatestCompletedAssistant(chat.id);
      if (sourceAssetId) {
        // Only augment when the user didn't already include this exact asset
        // — keeps multi-turn reroll deterministic.
        const alreadyPresent = effectiveRefs.some(
          (r) => r.asset_id === sourceAssetId,
        );
        if (!alreadyPresent) {
          effectiveRefs = [
            ...effectiveRefs,
            { asset_id: sourceAssetId, role: 'content' as const },
          ];
          warnings.push('autoAppendedRefFromHistory');
        }
      }
    } else {
      return NextResponse.json(
        {
          error: 'capability_unsupported',
          cap: 'conversational',
          model: input.model,
          field: 'conversational',
        },
        { status: 400 },
      );
    }
  }

  // Resolve ref assets (must belong to this workspace). Soft-tolerant: missing
  // assets are skipped so a stale FE reference doesn't take down a whole gen.
  let refInputs: UpstreamInputImage[] = [];
  let skippedRefsCount = 0;
  if (effectiveRefs.length) {
    const ids = effectiveRefs.map((r) => r.asset_id);
    const refRows = await getAssetsByIdsForWorkspace(ids, ws.id);
    const byId = new Map(refRows.map((a) => [a.id, a]));
    const storage = getStorage();
    refInputs = (
      await Promise.all(
        effectiveRefs.map(async (r) => {
          const a = byId.get(r.asset_id);
          if (!a) {
            skippedRefsCount++;
            return null;
          }
          const { bytes, mime } = await storage.get(a.storageKey);
          return { bytes, mime, role: r.role } satisfies UpstreamInputImage;
        }),
      )
    ).filter((x): x is UpstreamInputImage => x !== null);
  }
  if (skippedRefsCount > 0) {
    // Format: <kind>[:detail] — no spaces, FE uses .includes() for kind.
    warnings.push(`skippedRefs:${skippedRefsCount}`);
  }

  // Reserve quota up front. Roll back on upstream failure.
  const reservation = await reserveQuota(ws.id, n);
  if (!reservation.ok) {
    return NextResponse.json(
      { error: 'quota_exceeded', message: '本月图片配额已用完,请升级套餐或等下个周期。' },
      { status: 402 },
    );
  }

  // Record user prompt + create pending assistant message. Per-ref roles flow
  // straight through to the jsonb column. parentMessageId enables reroll
  // threading.
  //
  // Asymmetry: user message stores `input.refs` (what the user actually
  // attached — intent for the message bubble UI), assistant message stores
  // `effectiveRefs` (what upstream actually saw, after autoChain appended a
  // history ref and/or soft-skip dropped missing assets — source of truth for
  // what generated this image, so reroll/remix reconstructs the real inputs).
  const userMsg = await recordUserMessage({
    chatId: chat.id,
    text: input.prompt,
    refs: input.refs,
    parentMessageId: input.parentMessageId,
  });
  const assistantMsg = await createPendingAssistantMessage({
    chatId: chat.id,
    model: model.id,
    params: {
      n,
      size: input.size ?? model.defaultSize,
      aspectRatio: input.aspectRatio ?? model.defaultAspectRatio,
      quality: input.quality,
      background: input.background,
      seed: input.seed,
      transparentBackground: input.transparentBackground,
    },
    refs: effectiveRefs,
    parentMessageId: input.parentMessageId,
  });

  let upstream: { mime: string; bytes: Buffer }[] = [];
  try {
    upstream = await generate({
      model: model.id,
      prompt: input.prompt,
      n,
      size: input.size,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      background: input.background,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.transparentBackground ? { transparentBackground: true } : {}),
      inputImages: refInputs,
      ...(historyMessages && historyMessages.length > 0
        ? { historyMessages }
        : {}),
    });
  } catch (err) {
    await refundQuota(ws.id, n);
    const message = err instanceof Error ? err.message : 'unknown';
    const status = err instanceof UpstreamError ? err.status : 500;
    const upstreamBody = err instanceof UpstreamError ? err.body : undefined;
    await failAssistantMessage(assistantMsg.id, { message, status, body: upstreamBody });
    return NextResponse.json(
      { error: 'upstream_failed', message, status },
      { status: 502 },
    );
  }

  // Persist each generated image as an asset row.
  const storage = getStorage();
  const outputAssetIds: string[] = [];
  const outputAssets: Array<{ id: string; publicUrl: string; mime: string }> = [];
  for (const img of upstream) {
    const created = await insertAsset({
      workspaceId: ws.id,
      uploaderUserId: user.id,
      type: 'generated',
      storageKey: 'pending',
      mime: img.mime,
      fileSize: img.bytes.length,
      category: 'studio',
    });
    const key = `workspaces/${ws.id}/assets/${created.id}.${extForMime(img.mime)}`;
    const put = await storage.put({ key, bytes: img.bytes, mime: img.mime });
    await db
      .update(assets)
      .set({ storageKey: put.storageKey, hash: put.sha256 })
      .where(eq(assets.id, created.id));
    outputAssetIds.push(created.id);
    outputAssets.push({
      id: created.id,
      mime: img.mime,
      publicUrl: storage.publicUrl(put.storageKey),
    });
  }

  await completeAssistantMessage(assistantMsg.id, outputAssetIds);
  await touchChat(chat.id);
  await recordUsage({
    workspaceId: ws.id,
    userId: user.id,
    n,
    chatId: chat.id,
    messageId: assistantMsg.id,
    model: model.id,
  });

  // Moodboard cover hint — first-wins. Quota is consumed and outputs are
  // persisted at this point, so the ownership lookup AND the cover write
  // both run inside one fire-and-forget try/catch — neither a DB hiccup on
  // getMoodboardById nor on setCoverIfMissing should 500 a successful gen.
  // Foreign moodboards silently no-op (no existence leak). The
  // WHERE cover_asset_id IS NULL inside setCoverIfMissing handles concurrency.
  if (input.moodboardId && outputAssets.length > 0) {
    const moodboardId = input.moodboardId;
    const firstAssetId = outputAssets[0]!.id;
    void (async () => {
      try {
        const mb = await getMoodboardById(moodboardId, user.id);
        if (mb) {
          await setCoverIfMissing(moodboardId, firstAssetId);
        }
      } catch (e) {
        console.warn('[generate] moodboard cover write failed:', e);
      }
    })();
  }

  return NextResponse.json({
    userMessage: userMsg,
    assistantMessage: {
      ...assistantMsg,
      status: 'completed',
      outputAssetIds,
    },
    outputs: outputAssets,
    remainingQuota: reservation.ok ? reservation.remaining : 0,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
