/**
 * POST /api/studio/chats/[id]/generate
 *
 * Lifecycle:
 *   1. validate chat ownership + model + ref assets
 *   2. reserve quota (atomic UPDATE … WHERE)
 *   3. insert user message (prompt + ref ids)
 *   4. insert assistant message in 'generating' status
 *   5. fetch ref-asset bytes from storage (i2i path)
 *   6. call upstream gateway
 *   7. on success: write each generated image to storage + assets;
 *      update assistant.outputAssetIds + status=completed;
 *      record usage + activity
 *   8. on failure: refund quota; mark assistant status=failed
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
  recordUsage,
  recordUserMessage,
  refundQuota,
  reserveQuota,
  touchChat,
} from '@/lib/db/studio-queries';
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
  // Schema-only in Task 6 — behavior wiring lands in Task 7.
  conversational: z.boolean().optional(),
  parentMessageId: z.string().uuid().optional(),
  seed: z.number().int().optional(),
  transparentBackground: z.boolean().optional(),
  // Schema-only in Task 6 — cover write-back lands in Task 7.
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

  // Resolve ref assets (must belong to this workspace). Soft-tolerant: missing
  // assets are skipped so a stale FE reference doesn't take down a whole gen.
  let refInputs: UpstreamInputImage[] = [];
  if (input.refs?.length) {
    const ids = input.refs.map((r) => r.asset_id);
    const refRows = await getAssetsByIdsForWorkspace(ids, ws.id);
    const byId = new Map(refRows.map((a) => [a.id, a]));
    const storage = getStorage();
    refInputs = (
      await Promise.all(
        input.refs.map(async (r) => {
          const a = byId.get(r.asset_id);
          if (!a) return null;
          const { bytes, mime } = await storage.get(a.storageKey);
          return { bytes, mime, role: r.role } satisfies UpstreamInputImage;
        }),
      )
    ).filter((x): x is UpstreamInputImage => x !== null);
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
  // threading (Task 7 will wire the conversational branch).
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
    refs: input.refs,
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
      inputImages: refInputs,
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

  return NextResponse.json({
    userMessage: userMsg,
    assistantMessage: {
      ...assistantMsg,
      status: 'completed',
      outputAssetIds,
    },
    outputs: outputAssets,
    remainingQuota: reservation.ok ? reservation.remaining : 0,
  });
}
