/**
 * GET /api/workspace/runs/{id}
 *
 * Single agent run + its persisted steps + outputs, scoped to the
 * caller's workspace. Powers /dashboard/runs/{id} detail page.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  agentRuns,
  agentSteps,
  assets,
  listingPacks,
  outputs,
} from '@/lib/db/schema';
import { getWorkspaceForUser } from '@/lib/db/queries';
import { getStorage } from '@/lib/storage';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'no workspace' }, { status: 401 });
  }

  const runRows = await db
    .select({
      run: agentRuns,
      pack: listingPacks,
    })
    .from(agentRuns)
    .innerJoin(listingPacks, eq(listingPacks.id, agentRuns.listingPackId))
    .where(
      and(
        eq(agentRuns.id, id),
        eq(listingPacks.workspaceId, ws.id),
      ),
    )
    .limit(1);

  const row = runRows[0];
  if (!row) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  const steps = await db
    .select()
    .from(agentSteps)
    .where(eq(agentSteps.agentRunId, id))
    .orderBy(asc(agentSteps.startedAt));

  const outputRows = await db
    .select({
      id: outputs.id,
      platform: outputs.platform,
      slot: outputs.slot,
      assetId: outputs.assetId,
      metadata: outputs.metadata,
      createdAt: outputs.createdAt,
      storageKey: assets.storageKey,
      mime: assets.mime,
      fileSize: assets.fileSize,
    })
    .from(outputs)
    .innerJoin(assets, eq(assets.id, outputs.assetId))
    .where(eq(outputs.listingPackId, row.pack.id));

  const storage = getStorage();

  return NextResponse.json({
    run: {
      id: row.run.id,
      status: row.run.status,
      currentStep: row.run.currentStep,
      plan: row.run.plan,
      state: row.run.state,
      costCapUsd: row.run.costCapUsd,
      costSpentUsd: row.run.costSpentUsd,
      startedAt: row.run.startedAt,
      endedAt: row.run.endedAt,
      createdAt: row.run.createdAt,
      error: row.run.error,
    },
    listingPack: {
      id: row.pack.id,
      name: row.pack.name,
      targetPlatforms: row.pack.targetPlatforms,
      category: row.pack.category,
    },
    steps: steps.map((s) => ({
      id: s.id,
      stepName: s.stepName,
      status: s.status,
      outputs: s.outputs,
      error: s.error,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    })),
    outputs: outputRows.map((o) => ({
      id: o.id,
      platform: o.platform,
      slot: o.slot,
      assetId: o.assetId,
      mime: o.mime,
      fileSize: o.fileSize,
      publicUrl: storage.publicUrl(o.storageKey),
      metadata: o.metadata,
    })),
  });
}
