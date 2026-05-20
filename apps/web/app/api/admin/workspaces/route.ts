/**
 * GET /api/admin/workspaces
 *
 * Cross-workspace census for customer-support staff. Lists each workspace
 * with its current plan + sku usage + active subscription status.
 *
 * Access: ADMIN_USER_EMAILS whitelist (see lib/auth/admin.ts).
 */

import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { subscriptions, users, workspaces } from '@/lib/db/schema';
import { getAdminUser } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      planId: workspaces.planId,
      createdAt: workspaces.createdAt,
      deletedAt: workspaces.deletedAt,
      ownerEmail: users.email,
      ownerName: users.name,
      subPlan: subscriptions.plan,
      subStatus: subscriptions.status,
      subQuota: subscriptions.skuQuota,
      subUsed: subscriptions.skuUsed,
      overageEnabled: subscriptions.overageEnabled,
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(workspaces)
    .leftJoin(users, eq(users.id, workspaces.ownerUserId))
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .orderBy(desc(workspaces.createdAt))
    .limit(200);

  return NextResponse.json({ workspaces: rows });
}
