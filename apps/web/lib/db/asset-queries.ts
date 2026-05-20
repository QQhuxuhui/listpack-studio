/**
 * Asset + ListingPack write helpers.
 *
 * Keeps the create path inside one transaction so a failed listing_pack
 * insert doesn't leave orphan assets.
 */

import { and, eq } from 'drizzle-orm';
import { db } from './drizzle';
import {
  assets,
  listingPacks,
  type Asset,
  type ListingPack,
  type NewAsset,
  type NewListingPack,
} from './schema';

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

export async function insertListingPack(
  input: NewListingPack,
): Promise<ListingPack> {
  const [row] = await db.insert(listingPacks).values(input).returning();
  if (!row) throw new Error('insertListingPack returned empty row');
  return row;
}

export async function getListingPackForWorkspace(
  id: string,
  workspaceId: string,
): Promise<ListingPack | null> {
  const rows = await db
    .select()
    .from(listingPacks)
    .where(
      and(
        eq(listingPacks.id, id),
        eq(listingPacks.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
