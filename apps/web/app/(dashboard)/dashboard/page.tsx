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
  updateOverageEnabled,
} from '@/app/(login)/actions';
import { customerPortalAction } from '@/lib/payments/actions';
import type { Member, User, WorkspaceWithMembers } from '@/lib/db/schema';
import { getPlan } from '@/lib/payments/plans';
import { useDictionary } from '@/lib/i18n/client';
// dictionary-registry, NOT dictionary — this is a client component
// and `dictionary` imports server-only (next/headers).
import { fmt } from '@/lib/i18n/dictionary-registry';

type ActionState = { error?: string; success?: string };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SubscriptionSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>工作区订阅</CardTitle>
      </CardHeader>
    </Card>
  );
}

function PlanAndQuota() {
  const { t } = useDictionary();
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
      ? `试用期 · ${plan.trialDays} 天`
      : sub?.status === 'past_due'
        ? '账单逾期'
        : sub?.status === 'canceled'
          ? '已取消 —— 本周期结束后将回落到免费版'
          : sub?.status === 'active'
            ? `按月计费 · $${plan.monthlyPriceCents ? plan.monthlyPriceCents / 100 : 0}`
            : '尚无有效订阅';

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t.dashboard.plan_and_usage}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <p className="font-medium text-lg">{plan.displayName} 套餐</p>
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {planId === 'free' && (
              <Link href="/pricing">
                <Button variant="default" size="sm">
                  {t.dashboard.upgrade}
                </Button>
              </Link>
            )}
            <form action={customerPortalAction}>
              <Button type="submit" variant="outline" size="sm">
                {t.dashboard.manage_billing}
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {fmt(t.dashboard.skus_used, { used, quota })}
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
              {fmt(t.dashboard.over_quota, { n: used - quota })}{' '}
              {overageActive
                ? plan.overagePerSkuUsd
                  ? fmt(t.dashboard.overage_rate_line, {
                      rate: plan.overagePerSkuUsd,
                    })
                  : ''
                : t.dashboard.overage_disabled_line}
            </p>
          )}
          {!overUsed && plan.overagePerSkuUsd !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              {fmt(t.dashboard.overage_below_quota_line, {
                quota,
                rate: plan.overagePerSkuUsd,
              })}
            </p>
          )}
        </div>

        {/* Overage toggle — hidden on Free (which never allows overage). */}
        {plan.overagePerSkuUsd !== null && <OverageToggle enabled={sub?.overageEnabled ?? false} />}
      </CardContent>
    </Card>
  );
}

function OverageToggle({ enabled }: { enabled: boolean }) {
  const { t } = useDictionary();
  const [state, action, isPending] = useActionState<
    ActionState,
    FormData
  >(updateOverageEnabled, {});
  const next = enabled ? 'false' : 'true';

  return (
    <form action={action} className="mt-5 border-t border-gray-100 pt-4">
      <input type="hidden" name="enabled" value={next} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">{t.dashboard.overage_toggle_h}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled
              ? t.dashboard.overage_on_desc
              : t.dashboard.overage_off_desc}
          </p>
        </div>
        <Button
          type="submit"
          variant={enabled ? 'outline' : 'default'}
          size="sm"
          disabled={isPending}
        >
          {isPending
            ? t.dashboard.overage_saving
            : enabled
              ? t.dashboard.overage_disable
              : t.dashboard.overage_enable}
        </Button>
      </div>
      {state?.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state?.success && <p className="text-xs text-green-700 mt-2">{state.success}</p>}
    </form>
  );
}

function WorkspaceMembersSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>工作区成员</CardTitle>
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
    u.name || u.email || '未知用户';

  if (memberList.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>工作区成员</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">还没有成员。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>工作区成员</CardTitle>
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
                    {isRemovePending ? '移除中…' : '移除'}
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
        <CardTitle>邀请工作区成员</CardTitle>
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
        <CardTitle>邀请工作区成员</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={inviteAction} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2">
              邮箱
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="请输入邮箱"
              required
              disabled={!isOwner}
            />
          </div>
          <div>
            <Label>角色</Label>
            <RadioGroup
              defaultValue="editor"
              name="role"
              className="flex space-x-4"
              disabled={!isOwner}
            >
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="admin" id="role-admin" />
                <Label htmlFor="role-admin">管理员</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="editor" id="role-editor" />
                <Label htmlFor="role-editor">编辑者</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="viewer" id="role-viewer" />
                <Label htmlFor="role-viewer">查看者</Label>
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
                邀请中…
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                邀请成员
              </>
            )}
          </Button>
        </form>
      </CardContent>
      {!isOwner && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            只有工作区所有者可以邀请新成员。
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

function SettingsHeader() {
  const { t } = useDictionary();
  return (
    <h1 className="text-lg lg:text-2xl font-medium mb-6">
      {t.dashboard.workspace_settings}
    </h1>
  );
}

export default function SettingsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <SettingsHeader />
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
