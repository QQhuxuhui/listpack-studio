/**
 * GET /api/shopify/oauth/authorize?shop=…
 *
 * Kicks off the Shopify install flow. Generates a random `state` token,
 * sets it as an httpOnly cookie (CSRF guard), and 302's to Shopify's
 * authorize URL.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { buildAuthorizeUrl, isValidShopDomain } from '@/lib/shopify/oauth';

const STATE_COOKIE = 'shopify_oauth_state';
const STATE_TTL_SECONDS = 600; // 10 min — Shopify install rarely takes longer

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop')?.toLowerCase().trim();
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: 'invalid or missing `shop` (expected *.myshopify.com)' },
      { status: 400 },
    );
  }

  let state: string;
  let authorizeUrl: string;
  try {
    state = randomBytes(24).toString('hex');
    authorizeUrl = buildAuthorizeUrl(shop, state);
  } catch (err) {
    // Most likely SHOPIFY_API_KEY/SECRET/SCOPES/REDIRECT_URI not configured
    // — return 503 so admins can spot it in logs.
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 503 },
    );
  }

  const res = NextResponse.redirect(authorizeUrl, 302);
  res.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/',
  });
  return res;
}
