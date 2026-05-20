/**
 * Brand-kit read / upsert helpers.
 *
 * v1: one brand_kit per workspace (UNIQUE(workspace_id)). v2 will lift
 * the unique constraint to support agency-style "client kits". Keep this
 * file small so the v2 migration is a focused diff.
 */

import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { brandKits, type BrandKit, type NewBrandKit } from './schema';

export async function getBrandKitForWorkspace(
  workspaceId: string,
): Promise<BrandKit | null> {
  const rows = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

export type BrandKitPatch = Partial<
  Pick<
    BrandKit,
    | 'name'
    | 'logoAssetId'
    | 'primaryColor'
    | 'secondaryColor'
    | 'accentColor'
    | 'fontFamily'
    | 'tagline'
    | 'metadata'
  >
>;

export async function upsertBrandKit(
  workspaceId: string,
  patch: BrandKitPatch,
): Promise<BrandKit> {
  const values: NewBrandKit = {
    workspaceId,
    name: patch.name ?? 'Default',
    logoAssetId: patch.logoAssetId,
    primaryColor: patch.primaryColor,
    secondaryColor: patch.secondaryColor,
    accentColor: patch.accentColor,
    fontFamily: patch.fontFamily,
    tagline: patch.tagline,
    metadata: patch.metadata,
  };

  const [row] = await db
    .insert(brandKits)
    .values(values)
    .onConflictDoUpdate({
      target: brandKits.workspaceId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error('upsertBrandKit returned empty row');
  return row;
}
