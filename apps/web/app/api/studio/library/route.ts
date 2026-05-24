/**
 * GET /api/studio/library
 *
 * Returns the workspace's generated images across all (non-soft-deleted)
 * chats, newest first. Supports cursor pagination and optional model filter.
 *
 * Query params:
 *   - model (repeatable): only include items from these model ids
 *   - before (ISO timestamp): page cursor — return items with createdAt < before
 *   - limit (1..50, default 24): page size
 *
 * Response:
 *   { items: LibraryItem[], nextCursor: string | null }
 */
import { NextResponse } from 'next/server';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import { listLibraryAssets } from '@/lib/db/studio-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const [user, workspace] = await Promise.all([
    getUser(),
    getWorkspaceForUser(),
  ]);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!workspace) {
    return NextResponse.json({ error: 'no_workspace' }, { status: 400 });
  }

  const url = new URL(req.url);
  const modelFilter = url.searchParams.getAll('model').filter(Boolean);
  const beforeStr = url.searchParams.get('before');
  const limit = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '24', 10) || 24),
  );
  const before = beforeStr ? new Date(beforeStr) : undefined;

  // Over-fetch by one to detect hasMore without a second round-trip.
  const items = await listLibraryAssets({
    workspaceId: workspace.id,
    modelFilter: modelFilter.length ? modelFilter : undefined,
    before,
    limit: limit + 1,
  });
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  const nextCursor = hasMore
    ? page[page.length - 1]!.createdAt.toISOString()
    : null;

  return NextResponse.json({ items: page, nextCursor });
}
