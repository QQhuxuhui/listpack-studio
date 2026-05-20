/**
 * POST /api/assets
 *
 * Multipart upload (`file`) → storage backend + assets row.
 * Returns `{ id, storageKey, publicUrl, mime, fileSize, sha256 }`.
 *
 * Used both standalone (Brand Kit, future uploads) and as a sub-step of
 * /api/agent/listing-pack/runs auto-create.
 */

import { NextResponse } from 'next/server';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import { insertAsset } from '@/lib/db/asset-queries';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/gif',
  'image/heic',
]);

function extFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/tiff':
      return 'tif';
    case 'image/gif':
      return 'gif';
    case 'image/heic':
      return 'heic';
    default:
      return 'bin';
  }
}

export async function POST(request: Request) {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user || !ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const type = (form.get('type') as string | null) ?? 'source_photo';
  const category = (form.get('category') as string | null) ?? null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: '`file` field required' },
      { status: 400 },
    );
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: `unsupported mime: ${mime}` },
      { status: 415 },
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'empty upload' }, { status: 400 });
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `file too large: ${bytes.length} bytes` },
      { status: 413 },
    );
  }

  // Insert first to get the uuid, then write to storage keyed by that uuid.
  const created = await insertAsset({
    workspaceId: ws.id,
    uploaderUserId: user.id,
    type: type as 'source_photo' | 'output' | 'intermediate' | 'brand_reference',
    storageKey: 'pending', // overwritten below
    mime,
    fileSize: bytes.length,
    category,
  });

  const key = `workspaces/${ws.id}/assets/${created.id}.${extFor(mime)}`;
  const storage = getStorage();
  const put = await storage.put({ key, bytes, mime });

  // Patch the asset row with the real storage key + hash.
  const { db } = await import('@/lib/db/drizzle');
  const { assets } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  await db
    .update(assets)
    .set({ storageKey: put.storageKey, hash: put.sha256 })
    .where(eq(assets.id, created.id));

  return NextResponse.json({
    id: created.id,
    storageKey: put.storageKey,
    publicUrl: storage.publicUrl(put.storageKey),
    mime,
    fileSize: put.size,
    sha256: put.sha256,
  });
}
