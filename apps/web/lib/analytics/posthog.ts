/**
 * PostHog product analytics — server + client.
 *
 * Server captures (sign-up, checkout, run started, run completed) go
 * through `posthogServer.capture()` so we can attribute users even
 * before they consent to client-side tracking.
 *
 * Client captures (page views, button clicks) initialise via the
 * `<PostHogProvider>` in app/(dashboard)/layout (D54).
 *
 * NEXT_PUBLIC_POSTHOG_KEY unset → no-op. We never block requests on
 * analytics — captures are fire-and-forget.
 */

import { PostHog } from 'posthog-node';

let _server: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  if (_server) return _server;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  _server = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    // Background flush keeps the request hot path latency-free.
    flushAt: 20,
    flushInterval: 10000,
  });
  return _server;
}

/**
 * Best-effort capture from server code (server actions, API routes,
 * webhooks). Never throws. `distinctId` is usually the user id; for
 * anonymous events pass a stable session id.
 */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  const ph = getPostHogServer();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
  } catch (err) {
    console.warn('posthog capture failed', err);
  }
}

/**
 * Graceful shutdown — should be called on SIGTERM in long-lived hosts
 * so queued events get flushed before exit. Vercel / Edge skips this.
 */
export async function flushPostHog(): Promise<void> {
  if (!_server) return;
  try {
    await _server.shutdown();
  } catch {
    /* swallow — best-effort */
  }
}
