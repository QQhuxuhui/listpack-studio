import { and, desc, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { db } from './drizzle';
import {
  activityLogs,
  members,
  subscriptions,
  users,
  workspaces,
  type Subscription,
  type WorkspaceWithMembers,
} from './schema';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie?.value) return null;

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'string'
  ) {
    return null;
  }
  if (new Date(sessionData.expires) < new Date()) return null;

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  return user[0] ?? null;
}

/**
 * Locate a subscription (and its workspace) by Stripe customer id.
 * Returns null if not found. Stripe linkage now lives on subscriptions, not workspaces.
 */
export async function getSubscriptionByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  return result[0] ?? null;
}

export async function updateSubscription(
  subscriptionId: string,
  data: Partial<
    Pick<
      Subscription,
      | 'plan'
      | 'status'
      | 'stripeSubscriptionId'
      | 'stripeProductId'
      | 'currentPeriodStart'
      | 'currentPeriodEnd'
      | 'skuQuota'
      | 'skuUsed'
      | 'overageEnabled'
    >
  >,
) {
  await db
    .update(subscriptions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId));
}

/**
 * Return the user's primary workspace membership.
 * For v1, each user has exactly one workspace (created at signup).
 * v2+: returns the most-recently-joined workspace.
 */
export async function getUserWithWorkspace(userId: string) {
  const result = await db
    .select({
      user: users,
      workspaceId: members.workspaceId,
      role: members.role,
    })
    .from(users)
    .leftJoin(members, eq(users.id, members.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) throw new Error('User not authenticated');

  return db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

/**
 * Workspace with members + subscription for the current session user.
 * Powers the dashboard `/api/workspace` endpoint.
 */
export async function getWorkspaceForUser(): Promise<WorkspaceWithMembers | null> {
  const user = await getUser();
  if (!user) return null;

  const result = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
    with: {
      workspace: {
        with: {
          members: {
            with: {
              user: {
                columns: { id: true, name: true, email: true },
              },
            },
          },
          subscription: true,
        },
      },
    },
  });

  if (!result?.workspace) return null;

  // `with` does not type-narrow `subscription` to nullable Subscription cleanly,
  // so we coerce here. `subscription` is a one-to-one optional relation.
  const ws = result.workspace as unknown as WorkspaceWithMembers;
  return ws;
}
