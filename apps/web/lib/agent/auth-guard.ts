/**
 * Auth guard for /api/agent/* proxy routes.
 *
 * The Next middleware at apps/web/middleware.ts deliberately skips
 * `/api/*` so server actions and webhooks can carry their own auth
 * mechanisms. But the agent proxy routes inject our private
 * `AGENT_SERVICE_TOKEN` into the upstream request, so anonymous
 * callers must NOT be able to reach them — they'd effectively get a
 * pre-signed admin call into the agent (compliance check, auto-fix,
 * run start, run pause/resume/cancel/fork).
 *
 * Every /api/agent/* route entry point calls `requireWorkspaceSession()`
 * before doing anything else. Returns the user + workspace on success
 * or a Response (401/403) the caller short-circuits with.
 */

import { NextResponse } from 'next/server';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import type { User, WorkspaceWithMembers } from '@/lib/db/schema';

export type AuthGuardOk = {
  user: User;
  workspace: WorkspaceWithMembers;
};

/**
 * Resolve session → user + workspace. Returns:
 *   - {ok: true, user, workspace} on success
 *   - {ok: false, response} when caller should bail (401/403)
 */
export async function requireWorkspaceSession(): Promise<
  | { ok: true; user: User; workspace: WorkspaceWithMembers }
  | { ok: false; response: NextResponse }
> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            type: 'unauthorized',
            message: 'sign in required',
          },
        },
        { status: 401 },
      ),
    };
  }
  const workspace = await getWorkspaceForUser();
  if (!workspace) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            type: 'forbidden',
            message: 'no workspace for user',
          },
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user, workspace };
}

/**
 * Verify the given agent run belongs to the caller's workspace. Used
 * by HITL ops (pause / resume / cancel / fork) so a sign-in alone
 * doesn't let a user move someone else's runs.
 */
export async function verifyRunInWorkspace(
  runId: string,
  workspaceId: string,
): Promise<boolean> {
  const { db } = await import('@/lib/db/drizzle');
  const { agentRuns, listingPacks } = await import('@/lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  const rows = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .innerJoin(listingPacks, eq(listingPacks.id, agentRuns.listingPackId))
    .where(and(eq(agentRuns.id, runId), eq(listingPacks.workspaceId, workspaceId)))
    .limit(1);
  return rows.length > 0;
}
