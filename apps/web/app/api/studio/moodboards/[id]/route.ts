/**
 * GET    /api/studio/moodboards/[id]   → moodboard + resolved cover/ref publicUrls
 * PATCH  /api/studio/moodboards/[id]   → update creator-owned moodboard
 * DELETE /api/studio/moodboards/[id]   → soft-delete creator-owned moodboard
 *
 * 鉴权策略：
 *   - 未登录 → 401
 *   - PATCH/DELETE 非创建者 → 403 (forbidden_or_not_found)
 *   - GET 非创建者 → 404 (not_found) —— 不区分"不存在/无权"两种态，避免泄露资源存在性。
 *     与 spec §6.5 字面"403"略有偏离；此处用 404 是更严的隐藏语义，等效阻断访问。
 */
import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { assets } from '@/lib/db/schema';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import {
  getMoodboardById,
  softDeleteMoodboard,
  updateMoodboard,
} from '@/lib/db/moodboard-queries';
import { getStorage } from '@/lib/storage';

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

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  promptTemplate: z.string().min(1).max(4000).optional(),
  model: z.string().max(100).nullable().optional(),
  size: z.string().max(20).nullable().optional(),
  aspectRatio: z.string().max(10).nullable().optional(),
  refs: refsSchema,
  notes: z.string().max(2000).nullable().optional(),
});

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteCtx) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const mb = await getMoodboardById(id, user.id);
  if (!mb) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Resolve cover + ref asset publicUrls in a single query.
  const refAssetIds = (mb.refs ?? []).map((r) => r.asset_id);
  const allIds = [
    ...refAssetIds,
    ...(mb.coverAssetId ? [mb.coverAssetId] : []),
  ];
  // Defense in depth: scope the asset lookup to the current workspace, so
  // even if a foreign asset_id somehow ended up in refs/coverAssetId
  // historically, it resolves to a null publicUrl (added to warnings as
  // skippedRef:<id>) rather than leaking a foreign asset's URL.
  const ws = await getWorkspaceForUser();
  const assetRows = allIds.length && ws
    ? await db
        .select()
        .from(assets)
        .where(and(inArray(assets.id, allIds), eq(assets.workspaceId, ws.id)))
    : [];
  const byId = new Map(assetRows.map((a) => [a.id, a]));
  const storage = getStorage();

  const warnings: string[] = [];
  const refsResolved = (mb.refs ?? [])
    .map((r) => {
      const a = byId.get(r.asset_id);
      if (!a) {
        warnings.push(`skippedRef:${r.asset_id}`);
        return null;
      }
      return {
        asset_id: r.asset_id,
        role: r.role,
        publicUrl: a.cdnUrl ?? storage.publicUrl(a.storageKey),
        mime: a.mime,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const cover = mb.coverAssetId ? byId.get(mb.coverAssetId) : null;
  const coverUrl = cover
    ? (cover.cdnUrl ?? storage.publicUrl(cover.storageKey))
    : null;

  return NextResponse.json({
    moodboard: { ...mb, refs: refsResolved, coverUrl },
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

export async function PATCH(req: Request, { params }: RouteCtx) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // Validate any ref asset_ids belong to the current workspace — same
  // cross-workspace guard as POST.
  if (parsed.data.refs?.length) {
    const ws = await getWorkspaceForUser();
    if (!ws) {
      return NextResponse.json({ error: 'no_workspace' }, { status: 400 });
    }
    const refIds = parsed.data.refs.map((r) => r.asset_id);
    const ownedAssets = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(inArray(assets.id, refIds), eq(assets.workspaceId, ws.id)));
    if (ownedAssets.length !== refIds.length) {
      return NextResponse.json(
        { error: 'refs_not_in_workspace' },
        { status: 400 },
      );
    }
  }
  const updated = await updateMoodboard(id, user.id, parsed.data);
  if (!updated) {
    return NextResponse.json(
      { error: 'forbidden_or_not_found' },
      { status: 403 },
    );
  }
  return NextResponse.json({ moodboard: updated });
}

export async function DELETE(_req: Request, { params }: RouteCtx) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const ok = await softDeleteMoodboard(id, user.id);
  if (!ok) {
    return NextResponse.json(
      { error: 'forbidden_or_not_found' },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
