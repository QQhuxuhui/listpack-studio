/**
 * GET /api/shopify/oauth/callback?code=…&shop=…&state=…&hmac=…
 *
 * Final leg of the Shopify install:
 *   1. Match `state` cookie (CSRF guard)
 *   2. Verify HMAC signature + shop domain
 *   3. Exchange code → access_token
 *   4. Upsert encrypted token into platform_connections
 *   5. Redirect to /dashboard/connections?ok=shopify
 *
 * Requires an authenticated session so we know which workspace to bind
 * the connection to. If the user isn't signed in, they're routed to
 * /sign-in?redirect=… and Shopify's install URL params are preserved.
 */

import { NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  verifyOAuthRedirect,
} from '@/lib/shopify/oauth';
import { upsertShopifyConnection } from '@/lib/shopify/connection-store';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';

const STATE_COOKIE = 'shopify_oauth_state';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split('=')[1];

  if (!stateCookie) {
    return NextResponse.json(
      { error: 'missing oauth state cookie (CSRF guard tripped)' },
      { status: 400 },
    );
  }

  let verified;
  try {
    verified = verifyOAuthRedirect(url.searchParams, stateCookie);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Require an authenticated user before we save the token.
  const user = await getUser();
  if (!user) {
    const redirectAfter = `/api/shopify/oauth/callback?${url.searchParams.toString()}`;
    return NextResponse.redirect(
      new URL(`/sign-in?redirect=${encodeURIComponent(redirectAfter)}`, url),
    );
  }

  const workspace = await getWorkspaceForUser();
  if (!workspace) {
    return NextResponse.json(
      { error: 'no workspace found for user' },
      { status: 400 },
    );
  }

  let exchange;
  try {
    exchange = await exchangeCodeForToken(verified.shop, verified.code);
  } catch (err) {
    return NextResponse.json(
      { error: `Shopify token exchange failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  try {
    await upsertShopifyConnection({
      workspaceId: workspace.id,
      shop: verified.shop,
      accessToken: exchange.accessToken,
      scope: exchange.scope,
      metadata: { installedAt: new Date().toISOString() },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `failed to persist Shopify connection: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Clear the state cookie + redirect to a connections landing page (TBD).
  const success = NextResponse.redirect(
    new URL(`/dashboard?connected=shopify&shop=${verified.shop}`, url),
    302,
  );
  success.cookies.delete(STATE_COOKIE);
  return success;
}
