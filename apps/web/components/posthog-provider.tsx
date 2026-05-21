'use client';

/**
 * PostHog client-side initialisation.
 *
 * Wrap the dashboard layout with `<PostHogProvider>` — it reads
 * NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST at mount and
 * silently no-ops when absent. Tracks pageviews automatically.
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (posthog.__loaded) return; // hot-reload guard
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false, // we fire manually so pathname is current
      capture_pageleave: true,
    });
  }, []);

  return (
    <>
      {/* useSearchParams() forces the subtree into CSR — Next requires
          it to live under <Suspense> or every page that mounts this
          provider fails to pre-render (D58.2 build fix). */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}

function PageviewTracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const url =
      pathname + (params?.toString() ? `?${params.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, params]);
  return null;
}
