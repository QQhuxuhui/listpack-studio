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
      error: '邮箱或密码错误,请重试。',
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
      error: '邮箱或密码错误,请重试。',
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

  redirect('/studio');
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // login.tsx always posts the hidden `inviteId` field, even when the
  // user landed on /sign-up without an `?inviteId=...` query — it
  // submits as an empty string. We coerce '' → undefined inside the
  // preprocess and let the INNER schema accept undefined via .optional().
  // (Previously .optional() lived OUTSIDE preprocess, so '' became
  // undefined, then the inner z.string().uuid() rejected undefined
  // with "Required" — exactly the regression that bit the next try.)
  inviteId: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().uuid().optional(),
  ),
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
      error: '创建账号失败,请重试。',
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = { email, passwordHash };
  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: '创建账号失败,请重试。',
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
      return { error: '邀请链接无效或已过期。', email, password };
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
      name: `${email.split('@')[0]} 的工作区`,
      ownerUserId: createdUser.id,
      planId: 'free',
    };

    [createdWorkspace] = await db
      .insert(workspaces)
      .values(newWorkspace)
      .returning();

    if (!createdWorkspace) {
      return {
        error: '创建工作区失败,请重试。',
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

  // D54: PostHog signup event — north-star funnel input.
  try {
    const { captureServerEvent } = await import('@/lib/analytics/posthog');
    captureServerEvent(createdUser.id, 'user_signed_up', {
      workspace_id: workspaceId,
      had_invite: Boolean(inviteId),
      plan: 'free',
    });
  } catch (err) {
    console.warn('posthog signup capture failed', err);
  }

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout' && createdWorkspace) {
    const priceId = formData.get('priceId') as string;
    const ws = await getWorkspaceForUser();
    return createCheckoutSession({ workspace: ws, priceId });
  }

  // New users land directly in the studio.
  redirect('/studio');
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
        error: '当前密码不正确。',
      };
    }
    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: '新密码不能与当前密码相同。',
      };
    }
    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: '两次输入的新密码不一致。',
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

    return { success: '密码修改成功。' };
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
        error: '密码错误,账号删除失败。',
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
  name: z.string().min(1, '请填写姓名').max(100),
  email: z.string().email('邮箱格式不正确'),
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

    return { name, success: '账号信息已更新。' };
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
      return { error: '当前用户没有所属工作区' };
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

    return { success: '成员已移除。' };
  },
);

const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  role: z.enum(['admin', 'editor', 'viewer']),
});

export const inviteWorkspaceMember = validatedActionWithUser(
  inviteWorkspaceMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithWorkspace = await getUserWithWorkspace(user.id);

    if (!userWithWorkspace?.workspaceId) {
      return { error: '当前用户没有所属工作区' };
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
      return { error: '该用户已是此工作区成员。' };
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
      return { error: '已向该邮箱发送过邀请。' };
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

    return { success: '邀请已发送。' };
  },
);

// ─── password reset (D44) ─────────────────────────────────────


const requestPasswordResetSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
});

/**
 * Email-link reset flow.
 *
 * Always returns success — even when the email isn't registered — so an
 * attacker can't enumerate accounts. Real users get the email; non-users
 * see the same success message.
 */
export const requestPasswordReset = validatedAction(
  requestPasswordResetSchema,
  async (data) => {
    const { email } = data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      try {
        const { signResetToken } = await import('@/lib/auth/reset-token');
        const { sendPasswordResetEmail } = await import('@/lib/email');
        const token = await signResetToken(user.id);
        const baseUrl = process.env.BASE_URL ?? '';
        await sendPasswordResetEmail({
          to: email,
          resetUrl: `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
        });
      } catch (err) {
        // Logged but never surfaced — keeps the enumeration guard intact.
        console.warn('password reset email failed', err);
      }
    }

    return {
      success: '如果该邮箱已注册,我们已发送密码重置链接。',
    };
  },
);

const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

/**
 * Consume a reset token and replace the user's password hash.
 *
 * Tokens are single-use *in practice* because we update `updatedAt` on
 * the user; we don't keep a server-side revocation list. If a user wants
 * to invalidate previously-issued tokens, they can hit "request new link"
 * which makes the old one moot once they use the new one.
 */
export const resetPassword = validatedAction(
  resetPasswordSchema,
  async (data) => {
    const { token, password } = data;

    let userId: string;
    try {
      const { verifyResetToken } = await import('@/lib/auth/reset-token');
      userId = await verifyResetToken(token);
    } catch (err) {
      return {
        error: `重置链接无效或已过期: ${(err as Error).message}`,
      };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.deletedAt) {
      return { error: '账号不存在。' };
    }

    const passwordHash = await hashPassword(password);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await logActivity(null, user.id, ActivityType.UPDATE_PASSWORD);
    await setSession(user);
    redirect('/studio');
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
      return { error: '当前用户没有所属工作区' };
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
        ? '已开启超额计费 —— 超出配额的任务将按超额费率扣费。'
        : '已关闭超额计费 —— 超出配额的任务将被拒绝。',
    };
  },
);
