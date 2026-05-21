import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agentRuns, listingPacks } from '@/lib/db/schema';
import { getWorkspaceForUser } from '@/lib/db/queries';

/**
 * GET /api/workspace/runs?limit=20
 *
 * Recent agent_runs for the current workspace. Joins on listing_packs so
 * we only return runs the user is allowed to see.
 */
export async function GET(req: Request) {
  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'no workspace' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);

  // Two-step (no relation defined) — fetch pack ids first, then runs.
  const packIds = (
    await db
      .select({ id: listingPacks.id })
      .from(listingPacks)
      .where(eq(listingPacks.workspaceId, ws.id))
  ).map((r) => r.id);

  if (packIds.length === 0) {
    return NextResponse.json({ runs: [] });
  }

  const rows = await db
    .select({
      id: agentRuns.id,
      listingPackId: agentRuns.listingPackId,
      status: agentRuns.status,
      currentStep: agentRuns.currentStep,
      costCapUsd: agentRuns.costCapUsd,
      costSpentUsd: agentRuns.costSpentUsd,
      startedAt: agentRuns.startedAt,
      endedAt: agentRuns.endedAt,
      createdAt: agentRuns.createdAt,
      error: agentRuns.error,
      plan: agentRuns.plan,
    })
    .from(agentRuns)
    .where(inArray(agentRuns.listingPackId, packIds))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);

  return NextResponse.json({ runs: rows });
}
