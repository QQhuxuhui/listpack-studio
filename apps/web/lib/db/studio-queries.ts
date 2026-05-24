/**
 * Studio (image-chat) DB helpers — server-side only.
 *
 * Quota model: every generated image consumes 1 from
 * subscriptions.sku_used (column kept; semantics is now "images"). The
 * helpers below atomically check + deduct, and on upstream failure the
 * caller must roll back via refundQuota().
 */

import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './drizzle';
import {
  ActivityType,
  activityLogs,
  assets,
  imageChats,
  imageMessages,
  subscriptions,
  usageRecords,
  type Asset,
  type ImageChat,
  type ImageMessage,
} from './schema';
import type { RefEntry } from '@/lib/studio/refs-type';

// ─── CHATS ───────────────────────────────────────────────────────────

export async function listChatsForWorkspace(
  workspaceId: string,
): Promise<ImageChat[]> {
  return db
    .select()
    .from(imageChats)
    .where(
      and(eq(imageChats.workspaceId, workspaceId), isNull(imageChats.deletedAt)),
    )
    .orderBy(desc(imageChats.updatedAt))
    .limit(50);
}

export async function getChatForWorkspace(
  id: string,
  workspaceId: string,
): Promise<ImageChat | null> {
  const rows = await db
    .select()
    .from(imageChats)
    .where(
      and(
        eq(imageChats.id, id),
        eq(imageChats.workspaceId, workspaceId),
        isNull(imageChats.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createChat(input: {
  workspaceId: string;
  userId: string;
  title?: string;
}): Promise<ImageChat> {
  const [row] = await db
    .insert(imageChats)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title ?? '新对话',
    })
    .returning();
  if (!row) throw new Error('createChat returned empty row');
  await db.insert(activityLogs).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: ActivityType.CREATE_IMAGE_CHAT,
  });
  return row;
}

export async function softDeleteChat(
  id: string,
  workspaceId: string,
): Promise<void> {
  await db
    .update(imageChats)
    .set({ deletedAt: new Date() })
    .where(and(eq(imageChats.id, id), eq(imageChats.workspaceId, workspaceId)));
}

export async function touchChat(id: string): Promise<void> {
  await db
    .update(imageChats)
    .set({ updatedAt: new Date() })
    .where(eq(imageChats.id, id));
}

// ─── MESSAGES ────────────────────────────────────────────────────────

export async function listMessagesForChat(
  chatId: string,
): Promise<ImageMessage[]> {
  return db
    .select()
    .from(imageMessages)
    .where(eq(imageMessages.chatId, chatId))
    .orderBy(imageMessages.createdAt);
}

export async function recordUserMessage(input: {
  chatId: string;
  text: string;
  refs?: RefEntry[];
  parentMessageId?: string;
}): Promise<ImageMessage> {
  const [row] = await db
    .insert(imageMessages)
    .values({
      chatId: input.chatId,
      role: 'user',
      text: input.text,
      refs: input.refs ?? null,
      parentMessageId: input.parentMessageId ?? null,
      status: 'completed',
      completedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('recordUserMessage returned empty row');
  return row;
}

export async function createPendingAssistantMessage(input: {
  chatId: string;
  model: string;
  params: Record<string, unknown>;
  refs?: RefEntry[];
  parentMessageId?: string;
}): Promise<ImageMessage> {
  const [row] = await db
    .insert(imageMessages)
    .values({
      chatId: input.chatId,
      role: 'assistant',
      model: input.model,
      params: input.params,
      refs: input.refs ?? null,
      parentMessageId: input.parentMessageId ?? null,
      status: 'pending',
    })
    .returning();
  if (!row) throw new Error('createPendingAssistantMessage returned empty row');
  return row;
}

export async function completeAssistantMessage(
  id: string,
  outputAssetIds: string[],
): Promise<void> {
  await db
    .update(imageMessages)
    .set({
      status: 'completed',
      outputAssetIds,
      completedAt: new Date(),
    })
    .where(eq(imageMessages.id, id));
}

export async function failAssistantMessage(
  id: string,
  error: { message: string; status?: number; body?: string },
): Promise<void> {
  await db
    .update(imageMessages)
    .set({
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    .where(eq(imageMessages.id, id));
}

/**
 * Look up a single message by id, scoped to a chat. Used by the generate route
 * to validate that `parentMessageId` actually belongs to the chat the user is
 * posting to — defends against cross-chat lineage spoofing.
 */
export async function getMessageByIdForChat(
  messageId: string,
  chatId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: imageMessages.id })
    .from(imageMessages)
    .where(
      and(eq(imageMessages.id, messageId), eq(imageMessages.chatId, chatId)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Pull the most-recent N completed messages for a chat, returned in time-
 * ascending order so they can be replayed straight into an upstream
 * `messages[]` array. Used by the conversational (multiTurn) path.
 */
export async function getRecentChatMessagesForContext(
  chatId: string,
  limit: number,
): Promise<Array<{ role: 'user' | 'assistant'; text: string | null }>> {
  const rows = await db
    .select({
      role: imageMessages.role,
      text: imageMessages.text,
      createdAt: imageMessages.createdAt,
    })
    .from(imageMessages)
    .where(
      and(
        eq(imageMessages.chatId, chatId),
        eq(imageMessages.status, 'completed'),
      ),
    )
    .orderBy(desc(imageMessages.createdAt))
    .limit(limit);
  // Flip back to time-ascending for upstream replay.
  return rows.reverse().map((r) => ({ role: r.role, text: r.text }));
}

/**
 * Find the latest completed assistant message in a chat and return the first
 * id from its outputAssetIds — i.e. the "previous output image" for the
 * conversational auto-chain path on models without multiTurn support.
 */
export async function getFirstOutputAssetOfLatestCompletedAssistant(
  chatId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ ids: imageMessages.outputAssetIds })
    .from(imageMessages)
    .where(
      and(
        eq(imageMessages.chatId, chatId),
        eq(imageMessages.role, 'assistant'),
        eq(imageMessages.status, 'completed'),
      ),
    )
    .orderBy(desc(imageMessages.createdAt))
    .limit(1);
  return row?.ids?.[0] ?? null;
}

// ─── ASSETS LOOKUP ───────────────────────────────────────────────────

export async function getAssetsByIdsForWorkspace(
  ids: string[],
  workspaceId: string,
): Promise<Asset[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, ids)));
}

// ─── QUOTA ───────────────────────────────────────────────────────────

export interface QuotaState {
  used: number;
  quota: number;
  overageEnabled: boolean;
  remaining: number;
}

export async function getQuotaForWorkspace(
  workspaceId: string,
): Promise<QuotaState | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  const sub = rows[0];
  if (!sub) return null;
  return {
    used: sub.skuUsed,
    quota: sub.skuQuota,
    overageEnabled: sub.overageEnabled,
    remaining: Math.max(0, sub.skuQuota - sub.skuUsed),
  };
}

/**
 * Reserve N image credits up front. Increments sku_used immediately;
 * caller must call refundQuota() on upstream failure to release.
 *
 * Returns false when the workspace would exceed quota and overage is
 * disabled. Returns true otherwise (deducted, OK to proceed).
 */
export async function reserveQuota(
  workspaceId: string,
  n: number,
): Promise<{ ok: true; remaining: number } | { ok: false; reason: string }> {
  // Use a single UPDATE with a guard to avoid races; the WHERE clause
  // only matches when the deduction is safe.
  const result = await db
    .update(subscriptions)
    .set({ skuUsed: sql`${subscriptions.skuUsed} + ${n}` })
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        // safe if either overage is on, or we stay within quota
        sql`(${subscriptions.overageEnabled} = true OR (${subscriptions.skuUsed} + ${n}) <= ${subscriptions.skuQuota})`,
      ),
    )
    .returning({
      used: subscriptions.skuUsed,
      quota: subscriptions.skuQuota,
    });
  const row = result[0];
  if (!row) {
    return { ok: false, reason: 'quota_exceeded' };
  }
  return { ok: true, remaining: Math.max(0, row.quota - row.used) };
}

export async function refundQuota(
  workspaceId: string,
  n: number,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ skuUsed: sql`GREATEST(${subscriptions.skuUsed} - ${n}, 0)` })
    .where(eq(subscriptions.workspaceId, workspaceId));
}

export async function recordUsage(input: {
  workspaceId: string;
  userId: string;
  n: number;
  chatId: string;
  messageId: string;
  model: string;
}): Promise<void> {
  await db.insert(usageRecords).values({
    workspaceId: input.workspaceId,
    event: 'image_generated',
    quantity: input.n,
    metadata: {
      chatId: input.chatId,
      messageId: input.messageId,
      model: input.model,
    },
  });
  await db.insert(activityLogs).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: ActivityType.GENERATE_IMAGE,
    metadata: { chatId: input.chatId, n: input.n, model: input.model },
  });
}
