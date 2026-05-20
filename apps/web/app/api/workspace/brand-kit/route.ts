/**
 * GET / PUT /api/workspace/brand-kit
 *
 * Reads + upserts the single brand_kit row for the caller's workspace.
 * PUT body is JSON with the patch fields; missing fields keep prior values
 * (upsert merges defaults on insert).
 */

import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import { getAssetForWorkspace } from '@/lib/db/asset-queries';
import {
  getBrandKitForWorkspace,
  upsertBrandKit,
  type BrandKitPatch,
} from '@/lib/db/brand-kit-queries';
import { getWorkspaceForUser } from '@/lib/db/queries';

export const runtime = 'nodejs';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const kit = await getBrandKitForWorkspace(ws.id);
  if (!kit) {
    return NextResponse.json({ brandKit: null });
  }

  let logoUrl: string | null = null;
  if (kit.logoAssetId) {
    const logoAsset = await getAssetForWorkspace(kit.logoAssetId, ws.id);
    if (logoAsset) {
      logoUrl = getStorage().publicUrl(logoAsset.storageKey);
    }
  }

  return NextResponse.json({
    brandKit: {
      ...kit,
      logoUrl,
    },
  });
}

export async function PUT(req: Request) {
  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  let body: BrandKitPatch & { name?: string };
  try {
    body = (await req.json()) as BrandKitPatch;
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON body' },
      { status: 400 },
    );
  }

  // Lightweight server-side validation — UI guards too, but trust nothing.
  for (const key of ['primaryColor', 'secondaryColor', 'accentColor'] as const) {
    const v = body[key];
    if (v != null && v !== '' && !HEX_COLOR.test(v)) {
      return NextResponse.json(
        { error: `${key} must be a "#RRGGBB" hex string` },
        { status: 400 },
      );
    }
  }
  if (body.logoAssetId) {
    const asset = await getAssetForWorkspace(body.logoAssetId, ws.id);
    if (!asset) {
      return NextResponse.json(
        { error: 'logoAssetId not found in this workspace' },
        { status: 400 },
      );
    }
  }

  // Coerce empty strings to null so we don't store '' as a real value.
  const cleanedPatch: BrandKitPatch = {
    name: body.name ?? undefined,
    logoAssetId: body.logoAssetId ?? null,
    primaryColor: body.primaryColor || null,
    secondaryColor: body.secondaryColor || null,
    accentColor: body.accentColor || null,
    fontFamily: body.fontFamily?.trim() || null,
    tagline: body.tagline?.trim() || null,
    metadata: body.metadata ?? null,
  };

  const kit = await upsertBrandKit(ws.id, cleanedPatch);
  return NextResponse.json({ brandKit: kit });
}
