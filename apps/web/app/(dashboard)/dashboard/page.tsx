'use client';

import Link from 'next/link';
import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Loader2, PlusCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  inviteWorkspaceMember,
  removeWorkspaceMember,
} from '@/app/(login)/actions';
import { customerPortalAction } from '@/lib/payments/actions';
import type { Member, User, WorkspaceWithMembers } from '@/lib/db/schema';
import { getPlan } from '@/lib/payments/plans';

type ActionState = { error?: string; success?: string };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SubscriptionSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Workspace Subscription</CardTitle>
      </CardHeader>
    </Card>
  );
}

function PlanAndQuota() {
  const { data: ws } = useSWR<WorkspaceWithMembers>('/api/workspace', fetcher);
  const sub = ws?.subscription ?? null;
  const planId = sub?.plan ?? 'free';
  const plan = getPlan(planId);
  const used = sub?.skuUsed ?? 0;
  const quota = sub?.skuQuota ?? plan.skuQuota;
  const usagePct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const overUsed = used > quota;
  const overageActive = sub?.overageEnabled && overUsed;

  let barColor = 'bg-orange-500';
  if (usagePct >= 90) barColor = 'bg-red-500';
  else if (usagePct >= 70) barColor = 'bg-amber-500';

  const statusLabel =
    sub?.status === 'trialing'
      ? `Trial period · ${plan.trialDays} days`
      : sub?.status === 'past_due'
        ? 'Payment past due'
        : sub?.status === 'canceled'
          ? 'Canceled — falls back to Free at period end'
          : sub?.status === 'active'
            ? `Billed monthly · $${plan.monthlyPriceCents ? plan.monthlyPriceCents / 100 : 0}`
            : 'No active subscription';

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Plan &amp; Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <p className="font-medium text-lg">{plan.displayName} plan</p>
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {planId === 'free' && (
              <Link href="/pricing">
                <Button variant="default" size="sm">
                  Upgrade
                </Button>
              </Link>
            )}
            <form action={customerPortalAction}>
              <Button type="submit" variant="outline" size="sm">
                Manage billing
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              SKUs used this period: {used} / {quota}
            </span>
            <span className="text-muted-foreground">{usagePct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full transition-all ${barColor}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {overUsed && (
            <p className="text-xs text-red-600 mt-2">
              You're {used - quota} SKUs over your monthly quota.{' '}
              {overageActive
                ? plan.overagePerSkuUsd
                  ? `Overage rate: $${plan.overagePerSkuUsd} / SKU.`
                  : 'Overage not allowed on this plan.'
                : 'Overage is disabled — further runs will be rejected.'}
            </p>
          )}
          {!overUsed && plan.overagePerSkuUsd !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              Beyond {quota} SKUs: ${plan.overagePerSkuUsd} per SKU
              {sub?.overageEnabled === false ? ' (currently disabled)' : ''}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceMembersSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Workspace Members</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4 mt-1">
          <div className="flex items-center space-x-4">
            <div className="size-8 rounded-full bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 rounded" />
              <div className="h-3 w-14 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type MemberWithUser = Member & {
  user: Pick<User, 'id' | 'name' | 'email'>;
};

function WorkspaceMembers() {
  const { data: ws } = useSWR<WorkspaceWithMembers>('/api/workspace', fetcher);
  const [removeState, removeAction, isRemovePending] = useActionState<
    ActionState,
    FormData
  >(removeWorkspaceMember, {});

  const memberList: MemberWithUser[] = (ws?.members as MemberWithUser[]) ?? [];

  const displayName = (u: Pick<User, 'id' | 'name' | 'email'>) =>
    u.name || u.email || 'Unknown User';

  if (memberList.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Workspace Members</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No members yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Workspace Members</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {memberList.map((member, index) => (
            <li key={member.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarFallback>
                    {displayName(member.user)
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{displayName(member.user)}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {member.role}
                  </p>
                </div>
              </div>
              {index > 1 ? (
                <form action={removeAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isRemovePending}
                  >
                    {isRemovePending ? 'Removing...' : 'Remove'}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {removeState?.error && (
          <p className="text-red-500 mt-4">{removeState.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InviteMemberSkeleton() {
  return (
    <Card className="h-[260px]">
      <CardHeader>
        <CardTitle>Invite Workspace Member</CardTitle>
      </CardHeader>
    </Card>
  );
}

function InviteMember() {
  const { data: ws } = useSWR<WorkspaceWithMembers>('/api/workspace', fetcher);
  const { data: user } = useSWR<User>('/api/user', fetcher);

  // Owner role lives on Member, not User. The current user is owner iff
  // their member row in this workspace has role === 'owner'.
  const currentMember = (ws?.members as MemberWithUser[] | undefined)?.find(
    (m) => m.user.id === user?.id,
  );
  const isOwner = currentMember?.role === 'owner';

  const [inviteState, inviteAction, isInvitePending] = useActionState<
    ActionState,
    FormData
  >(inviteWorkspaceMember, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Workspace Member</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={inviteAction} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Enter email"
              required
              disabled={!isOwner}
            />
          </div>
          <div>
            <Label>Role</Label>
            <RadioGroup
              defaultValue="editor"
              name="role"
              className="flex space-x-4"
              disabled={!isOwner}
            >
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="admin" id="role-admin" />
                <Label htmlFor="role-admin">Admin</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="editor" id="role-editor" />
                <Label htmlFor="role-editor">Editor</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="viewer" id="role-viewer" />
                <Label htmlFor="role-viewer">Viewer</Label>
              </div>
            </RadioGroup>
          </div>
          {inviteState?.error && (
            <p className="text-red-500">{inviteState.error}</p>
          )}
          {inviteState?.success && (
            <p className="text-green-500">{inviteState.success}</p>
          )}
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={isInvitePending || !isOwner}
          >
            {isInvitePending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite Member
              </>
            )}
          </Button>
        </form>
      </CardContent>
      {!isOwner && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            You must be a workspace owner to invite new members.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">
        Workspace Settings
      </h1>
      <Suspense fallback={<SubscriptionSkeleton />}>
        <PlanAndQuota />
      </Suspense>
      <Suspense fallback={<WorkspaceMembersSkeleton />}>
        <WorkspaceMembers />
      </Suspense>
      <Suspense fallback={<InviteMemberSkeleton />}>
        <InviteMember />
      </Suspense>
    </section>
  );
}
