/**
 * Asset read / write helpers (generic; used by /api/assets upload).
 */

import { and, eq } from 'drizzle-orm';
import { db } from './drizzle';
import { assets, type Asset, type NewAsset } from './schema';

export async function insertAsset(input: NewAsset): Promise<Asset> {
  const [row] = await db.insert(assets).values(input).returning();
  if (!row) throw new Error('insertAsset returned empty row');
  return row;
}

export async function getAssetForWorkspace(
  id: string,
  workspaceId: string,
): Promise<Asset | null> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAssetByStorageKeyForWorkspace(
  storageKey: string,
  workspaceId: string,
): Promise<Asset | null> {
  const rows = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.storageKey, storageKey),
        eq(assets.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
