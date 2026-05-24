/**
 * Moodboard (saved generation preset / prompt template) DB helpers —
 * server-side only. Moodboards are scoped to (workspaceId, userId) and
 * soft-deleted via deletedAt. Cover thumbnail is set once on first
 * successful generation (first-wins via setCoverIfMissing).
 */

import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { moodboards, type Moodboard } from './schema';
import type { RefEntry } from '@/lib/studio/refs-type';

export interface CreateMoodboardInput {
  workspaceId: string;
  userId: string;
  title: string;
  promptTemplate: string;
  model?: string | null;
  size?: string | null;
  aspectRatio?: string | null;
  refs?: RefEntry[] | null;
  notes?: string | null;
}

export async function createMoodboard(
  input: CreateMoodboardInput,
): Promise<Moodboard> {
  const [row] = await db
    .insert(moodboards)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      promptTemplate: input.promptTemplate,
      model: input.model ?? null,
      size: input.size ?? null,
      aspectRatio: input.aspectRatio ?? null,
      refs: input.refs ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('createMoodboard failed');
  return row;
}

export async function listMoodboardsForUser(
  userId: string,
  limit = 50,
): Promise<Moodboard[]> {
  return db
    .select()
    .from(moodboards)
    .where(and(eq(moodboards.userId, userId), isNull(moodboards.deletedAt)))
    .orderBy(desc(moodboards.updatedAt))
    .limit(limit);
}

export async function getMoodboardById(
  id: string,
  userId: string,
): Promise<Moodboard | null> {
  const [row] = await db
    .select()
    .from(moodboards)
    .where(
      and(
        eq(moodboards.id, id),
        eq(moodboards.userId, userId),
        isNull(moodboards.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface UpdateMoodboardInput {
  title?: string;
  promptTemplate?: string;
  model?: string | null;
  size?: string | null;
  aspectRatio?: string | null;
  refs?: RefEntry[] | null;
  notes?: string | null;
}

export async function updateMoodboard(
  id: string,
  userId: string,
  patch: UpdateMoodboardInput,
): Promise<Moodboard | null> {
  const [row] = await db
    .update(moodboards)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(moodboards.id, id),
        eq(moodboards.userId, userId),
        isNull(moodboards.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function softDeleteMoodboard(
  id: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .update(moodboards)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(moodboards.id, id),
        eq(moodboards.userId, userId),
        isNull(moodboards.deletedAt),
      ),
    )
    .returning({ id: moodboards.id });
  return !!row;
}

/**
 * 首次写入 cover_asset_id；已有 cover 时无 op。返回 true=写入成功，false=已有 cover。
 * 用于 generate route 在成功生成后异步回写 Moodboard 封面。
 *
 * Uses raw SQL with WHERE cover_asset_id IS NULL to guarantee first-wins
 * semantics in the face of concurrent generates.
 */
export async function setCoverIfMissing(
  moodboardId: string,
  assetId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE moodboards
    SET cover_asset_id = ${assetId}, updated_at = NOW()
    WHERE id = ${moodboardId}
      AND cover_asset_id IS NULL
      AND deleted_at IS NULL
    RETURNING id
  `);
  // postgres-js driver returns array-like result with `.count` or `.length`;
  // drizzle's execute wraps it. Probe both shapes for safety.
  const obj = result as unknown as {
    rows?: unknown[];
    rowCount?: number;
    count?: number;
    length?: number;
  };
  if (typeof obj.rowCount === 'number') return obj.rowCount > 0;
  if (typeof obj.count === 'number') return obj.count > 0;
  if (Array.isArray(obj.rows)) return obj.rows.length > 0;
  if (typeof obj.length === 'number') return obj.length > 0;
  return false;
}
