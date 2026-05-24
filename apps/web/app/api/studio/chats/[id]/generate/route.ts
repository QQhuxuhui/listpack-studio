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
import { getModel } from '@/lib/studio/models';
import {
  generate,
  UpstreamError,
  type UpstreamInputImage,
} from '@/lib/studio/upstream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Image generation can take 30+ seconds; bump the default 10s budget.
export const maxDuration = 120;

const generateSchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z.string().min(1).max(100),
  n: z.number().int().min(1).max(8).default(1),
  size: z.string().max(20).optional(),
  aspectRatio: z.string().max(10).optional(),
  quality: z.enum(['low', 'medium', 'high', 'auto']).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  refAssetIds: z.array(z.string().uuid()).max(4).optional(),
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
    return NextResponse.json({ error: `unknown model: ${input.model}` }, { status: 400 });
  }
  const n = Math.min(input.n, model.maxN);

  // Resolve ref assets (must belong to this workspace).
  let refInputs: UpstreamInputImage[] = [];
  if (input.refAssetIds?.length) {
    if (!model.supportsImg2Img) {
      return NextResponse.json(
        { error: `model ${model.id} does not accept reference images` },
        { status: 400 },
      );
    }
    const refRows = await getAssetsByIdsForWorkspace(input.refAssetIds, ws.id);
    if (refRows.length !== input.refAssetIds.length) {
      return NextResponse.json(
        { error: 'some reference assets not found' },
        { status: 400 },
      );
    }
    const storage = getStorage();
    refInputs = await Promise.all(
      refRows.map(async (a) => {
        const { bytes, mime } = await storage.get(a.storageKey);
        return { bytes, mime };
      }),
    );
  }

  // Reserve quota up front. Roll back on upstream failure.
  const reservation = await reserveQuota(ws.id, n);
  if (!reservation.ok) {
    return NextResponse.json(
      { error: 'quota_exceeded', message: '本月图片配额已用完,请升级套餐或等下个周期。' },
      { status: 402 },
    );
  }

  // Record user prompt + create pending assistant message.
  // NOTE: refs default to role='content'; Task 6 will replace this with the
  // proper per-slot payload from the new request schema.
  const refs = input.refAssetIds?.map((id) => ({
    asset_id: id,
    role: 'content' as const,
  }));
  const userMsg = await recordUserMessage({
    chatId: chat.id,
    text: input.prompt,
    refs,
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
    },
    refs,
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
