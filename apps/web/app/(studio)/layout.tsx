'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Sparkles, LogOut, Settings } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PostHogProvider } from '@/components/posthog-provider';
import { signOut } from '@/app/(login)/actions';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Subscription } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function QuotaBadge() {
  const { data } = useSWR<{ subscription?: Subscription | null }>(
    '/api/workspace',
    fetcher,
    { refreshInterval: 30000 },
  );
  const sub = data?.subscription;
  if (!sub) return null;
  const remaining = Math.max(0, sub.skuQuota - sub.skuUsed);
  const pct = sub.skuQuota > 0 ? remaining / sub.skuQuota : 0;
  // 软提示：剩余 > 20% 时不显示，避免日常打扰
  if (pct > 0.2) return null;
  let color = 'text-gray-700';
  if (pct < 0.1) color = 'text-red-600';
  else if (pct < 0.3) color = 'text-amber-600';
  return (
    <Link
      href="/pricing"
      className={`text-sm font-medium hover:underline ${color}`}
      title={`图片配额 ${sub.skuUsed} / ${sub.skuQuota}`}
    >
      剩余 {remaining} 张
    </Link>
  );
}

function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link href="/sign-in" className="text-sm text-gray-700 hover:text-gray-900">
          登录
        </Link>
        <Button asChild className="rounded-full">
          <Link href="/sign-up">注册</Link>
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger>
        <Avatar className="cursor-pointer size-9">
          <AvatarImage alt={user.name || ''} />
          <AvatarFallback>
            {user.email
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1">
        <DropdownMenuItem className="cursor-pointer">
          <Link href="/dashboard" className="flex w-full items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>账号设置</span>
          </Link>
        </DropdownMenuItem>
        <form action={handleSignOut} className="w-full">
          <button type="submit" className="flex w-full">
            <DropdownMenuItem className="w-full flex-1 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>退出登录</span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '/';
  const navItem = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      className={`text-sm pb-1 ${
        isActive
          ? 'text-orange-600 border-b-2 border-orange-500 font-medium'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <PostHogProvider>
      <div className="flex flex-col h-[100dvh] bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="px-4 sm:px-6 py-3 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <Link href="/studio" className="flex items-center">
                <Sparkles className="h-6 w-6 text-orange-500" />
                <span className="ml-2 text-lg font-semibold text-gray-900">
                  ListPack Studio
                </span>
              </Link>
              {navItem('/studio', 'Studio', pathname === '/studio')}
              {navItem('/library', '图库', pathname.startsWith('/library'))}
            </div>
            <div className="flex items-center gap-4">
              <Suspense fallback={null}>
                <QuotaBadge />
              </Suspense>
              <Suspense fallback={<div className="h-9 w-9" />}>
                <UserMenu />
              </Suspense>
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </PostHogProvider>
  );
}
