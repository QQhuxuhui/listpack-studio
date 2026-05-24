/**
 * GET  /api/studio/moodboards   → list current user's moodboards (most recent)
 * POST /api/studio/moodboards   → create a new moodboard (saved preset / template)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { assets } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import {
  createMoodboard,
  listMoodboardsForUser,
} from '@/lib/db/moodboard-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const refsSchema = z
  .array(
    z.object({
      asset_id: z.string().uuid(),
      role: z.enum(['content', 'style', 'character']),
    }),
  )
  .max(8)
  .optional();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  promptTemplate: z.string().min(1).max(4000),
  model: z.string().max(100).optional(),
  size: z.string().max(20).optional(),
  aspectRatio: z.string().max(10).optional(),
  refs: refsSchema,
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await listMoodboardsForUser(user.id);

  // Resolve cover_asset_id → coverUrl in one batched query (drawer needs thumbnails)
  const coverIds = rows.map((r) => r.coverAssetId).filter((id): id is string => !!id);
  const coverAssets = coverIds.length
    ? await db.select().from(assets).where(inArray(assets.id, coverIds))
    : [];
  const storage = getStorage();
  const coverUrlById = new Map(
    coverAssets.map((a) => [a.id, a.cdnUrl ?? storage.publicUrl(a.storageKey)] as const),
  );

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    model: r.model,
    coverUrl: r.coverAssetId ? coverUrlById.get(r.coverAssetId) ?? null : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!ws) {
    return NextResponse.json({ error: 'no_workspace' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await createMoodboard({
    workspaceId: ws.id,
    userId: user.id,
    ...parsed.data,
  });
  return NextResponse.json({ moodboard: created }, { status: 201 });
}
