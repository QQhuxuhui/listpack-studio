'use server';

import { and, eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  ActivityType,
  invitations,
  members,
  subscriptions,
  users,
  workspaces,
  type NewActivityLog,
  type NewMember,
  type NewUser,
  type NewWorkspace,
  type User,
  type Workspace,
} from '@/lib/db/schema';
import {
  comparePasswords,
  hashPassword,
  setSession,
} from '@/lib/auth/session';
import { createCheckoutSession } from '@/lib/payments/stripe';
import { getUser, getUserWithWorkspace, getWorkspaceForUser } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser,
} from '@/lib/auth/middleware';

async function logActivity(
  workspaceId: string | null | undefined,
  userId: string,
  type: ActivityType,
  ipAddress?: string,
) {
  if (!workspaceId) return;
  const newActivity: NewActivityLog = {
    workspaceId,
    userId,
    action: type,
    ipAddress: ipAddress ?? '',
  };
  await db.insert(activityLogs).values(newActivity);
}

function workspaceSlugFor(email: string): string {
  const base = email
    .toLowerCase()
    .replace(/@/g, '-')
    .replace(/\./g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  // Append short random suffix to avoid uniqueness collisions on shared mailbox patterns.
  const suffix = uuidv7().split('-')[0];
  return `${base || 'workspace'}-${suffix}`;
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const rows = await db
    .select({
      user: users,
      workspace: workspaces,
    })
    .from(users)
    .leftJoin(members, eq(users.id, members.userId))
    .leftJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(eq(users.email, email))
    .limit(1);

  if (rows.length === 0) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password,
    };
  }

  const { user: foundUser, workspace: foundWorkspace } = rows[0]!;

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash,
  );

  if (!isPasswordValid) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password,
    };
  }

  await Promise.all([
    setSession(foundUser),
    logActivity(foundWorkspace?.id, foundUser.id, ActivityType.SIGN_IN),
  ]);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout' && foundWorkspace) {
    const priceId = formData.get('priceId') as string;
    const ws = await getWorkspaceForUser();
    return createCheckoutSession({ workspace: ws, priceId });
  }

  redirect('/dashboard');
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().uuid().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = { email, passwordHash };
  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password,
    };
  }

  let workspaceId: string;
  let userRole: 'owner' | 'admin' | 'editor' | 'viewer';
  let createdWorkspace: Workspace | null = null;

  if (inviteId) {
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, inviteId),
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (!invitation) {
      return { error: 'Invalid or expired invitation.', email, password };
    }

    workspaceId = invitation.workspaceId;
    userRole = invitation.role;

    await db
      .update(invitations)
      .set({ status: 'accepted' })
      .where(eq(invitations.id, invitation.id));

    await logActivity(workspaceId, createdUser.id, ActivityType.ACCEPT_INVITATION);

    [createdWorkspace] =
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1) ?? [];
  } else {
    // Default: each new signup gets a personal workspace, owner role.
    const newWorkspace: NewWorkspace = {
      slug: workspaceSlugFor(email),
      name: `${email.split('@')[0]}'s Workspace`,
      ownerUserId: createdUser.id,
      planId: 'free',
    };

    [createdWorkspace] = await db
      .insert(workspaces)
      .values(newWorkspace)
      .returning();

    if (!createdWorkspace) {
      return {
        error: 'Failed to create workspace. Please try again.',
        email,
        password,
      };
    }

    workspaceId = createdWorkspace.id;
    userRole = 'owner';

    // Free subscription stub so dashboard renders without a Stripe round-trip.
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await db.insert(subscriptions).values({
      workspaceId,
      plan: 'free',
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      skuQuota: 5,
      skuUsed: 0,
    });

    await logActivity(workspaceId, createdUser.id, ActivityType.CREATE_WORKSPACE);
  }

  const newMember: NewMember = {
    userId: createdUser.id,
    workspaceId,
    role: userRole,
  };

  await Promise.all([
    db.insert(members).values(newMember),
    logActivity(workspaceId, createdUser.id, ActivityType.SIGN_UP),
    setSession(createdUser),
  ]);

  // D30: welcome email (no-op if RESEND_API_KEY unset; never throws). We
  // import lazily to avoid loading email deps when this code path is
  // exercised by tests that don't care about delivery.
  try {
    const { sendWelcomeEmail } = await import('@/lib/email');
    const baseUrl = process.env.BASE_URL ?? '';
    await sendWelcomeEmail({
      to: email,
      workspaceName: createdWorkspace?.name ?? 'your workspace',
      dashboardUrl: `${baseUrl}/dashboard`,
    });
  } catch (err) {
    // Best-effort only — never block sign-up on email.
    console.warn('welcome email failed', err);
  }

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout' && createdWorkspace) {
    const priceId = formData.get('priceId') as string;
    const ws = await getWorkspaceForUser();
    return createCheckoutSession({ workspace: ws, priceId });
  }

  // New users land on /onboarding (D42) which auto-redirects existing users
  // (those who already have a listing_pack) onward to /dashboard.
  redirect('/onboarding');
});

export async function signOut() {
  const user = (await getUser()) as User;
  const userWithWorkspace = await getUserWithWorkspace(user.id);
  await logActivity(
    userWithWorkspace?.workspaceId ?? null,
    user.id,
    ActivityType.SIGN_OUT,
  );
  (await cookies()).delete('session');
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Current password is incorrect.',
      };
    }
    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.',
      };
    }
    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.',
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithWorkspace = await getUserWithWorkspace(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(
        userWithWorkspace?.workspaceId,
        user.id,
        ActivityType.UPDATE_PASSWORD,
      ),
    ]);

    return { success: 'Password updated successfully.' };
  },
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Incorrect password. Account deletion failed.',
      };
    }

    const userWithWorkspace = await getUserWithWorkspace(user.id);

    await logActivity(
      userWithWorkspace?.workspaceId,
      user.id,
      ActivityType.DELETE_ACCOUNT,
    );

    // Soft delete user; ensure email uniqueness for re-registration.
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')`,
      })
      .where(eq(users.id, user.id));

    if (userWithWorkspace?.workspaceId) {
      await db
        .delete(members)
        .where(
          and(
            eq(members.userId, user.id),
            eq(members.workspaceId, userWithWorkspace.workspaceId),
          ),
        );
    }

    (await cookies()).delete('session');
    redirect('/sign-in');
  },
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithWorkspace = await getUserWithWorkspace(user.id);

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(
        userWithWorkspace?.workspaceId,
        user.id,
        ActivityType.UPDATE_ACCOUNT,
      ),
    ]);

    return { name, success: 'Account updated successfully.' };
  },
);

const removeWorkspaceMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export const removeWorkspaceMember = validatedActionWithUser(
  removeWorkspaceMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithWorkspace = await getUserWithWorkspace(user.id);

    if (!userWithWorkspace?.workspaceId) {
      return { error: 'User is not part of a workspace' };
    }

    await db
      .delete(members)
      .where(
        and(
          eq(members.id, memberId),
          eq(members.workspaceId, userWithWorkspace.workspaceId),
        ),
      );

    await logActivity(
      userWithWorkspace.workspaceId,
      user.id,
      ActivityType.REMOVE_WORKSPACE_MEMBER,
    );

    return { success: 'Member removed successfully' };
  },
);

const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'editor', 'viewer']),
});

export const inviteWorkspaceMember = validatedActionWithUser(
  inviteWorkspaceMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithWorkspace = await getUserWithWorkspace(user.id);

    if (!userWithWorkspace?.workspaceId) {
      return { error: 'User is not part of a workspace' };
    }

    const existingMember = await db
      .select()
      .from(users)
      .leftJoin(members, eq(users.id, members.userId))
      .where(
        and(
          eq(users.email, email),
          eq(members.workspaceId, userWithWorkspace.workspaceId),
        ),
      )
      .limit(1);

    if (existingMember.length > 0) {
      return { error: 'User is already a member of this workspace' };
    }

    const existingInvitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.workspaceId, userWithWorkspace.workspaceId),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (existingInvitation.length > 0) {
      return { error: 'An invitation has already been sent to this email' };
    }

    const [createdInvite] = await db
      .insert(invitations)
      .values({
        workspaceId: userWithWorkspace.workspaceId,
        email,
        role,
        invitedByUserId: user.id,
        status: 'pending',
      })
      .returning();

    await logActivity(
      userWithWorkspace.workspaceId,
      user.id,
      ActivityType.INVITE_WORKSPACE_MEMBER,
    );

    // Best-effort invitation email. Never blocks — Resend may be unset in dev.
    try {
      const { sendWorkspaceInvitationEmail } = await import('@/lib/email');
      const [workspaceRow] = await db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, userWithWorkspace.workspaceId))
        .limit(1);
      const baseUrl = process.env.BASE_URL ?? '';
      await sendWorkspaceInvitationEmail({
        to: email,
        inviterName: user.name || user.email,
        workspaceName: workspaceRow?.name ?? 'a workspace',
        role,
        acceptUrl: `${baseUrl}/sign-up?inviteId=${encodeURIComponent(createdInvite?.id ?? '')}`,
      });
    } catch (err) {
      console.warn('invite email failed', err);
    }

    return { success: 'Invitation sent successfully' };
  },
);

const updateOverageEnabledSchema = z.object({
  enabled: z.enum(['true', 'false']),
});

/**
 * Toggle workspace.subscription.overage_enabled.
 *
 * PRD § 00 § 5.1 — Free plan never bills overage no matter what the flag
 * says (the agent's quota.py also enforces this). For paid tiers this
 * controls whether the next SKU past quota gets billed at the overage
 * rate or rejected at run-time with `run.quota_exceeded`.
 */
export const updateOverageEnabled = validatedActionWithUser(
  updateOverageEnabledSchema,
  async (data, _, user) => {
    const userWithWorkspace = await getUserWithWorkspace(user.id);
    if (!userWithWorkspace?.workspaceId) {
      return { error: 'User is not part of a workspace' };
    }

    const wantEnabled = data.enabled === 'true';
    await db
      .update(subscriptions)
      .set({ overageEnabled: wantEnabled, updatedAt: new Date() })
      .where(eq(subscriptions.workspaceId, userWithWorkspace.workspaceId));

    await logActivity(
      userWithWorkspace.workspaceId,
      user.id,
      ActivityType.UPDATE_OVERAGE_SETTING,
    );

    return {
      success: wantEnabled
        ? 'Overage billing enabled — runs past quota will be billed.'
        : 'Overage billing disabled — runs past quota will be rejected.',
    };
  },
);
