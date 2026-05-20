/**
 * Shopify OAuth helpers — implemented against the documented API directly
 * (no @shopify/shopify-api dependency).
 *
 * Why hand-rolled:
 * - @shopify/shopify-api ships its own session storage abstraction, express
 *   bindings and node ESM-only build that fights Next.js's edge runtime.
 *   We only need 4 things (auth URL, HMAC verify, code exchange, GraphQL
 *   client), all documented at:
 *     https://shopify.dev/docs/apps/build/authentication-authorization/get-started
 *
 * Flow per Shopify docs:
 *   1. App → buildAuthorizeUrl(shop, state) → 302 to https://{shop}/admin/oauth/authorize
 *   2. User installs / approves → Shopify redirects to redirectUri?code=…&shop=…&hmac=…&state=…
 *   3. App → verifyOAuthRedirect() — guards CSRF + tampering
 *   4. App → exchangeCodeForToken(shop, code) → permanent admin API token
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SHOPIFY_API_VERSION = '2025-01';

export interface ShopifyOAuthConfig {
  apiKey: string;
  apiSecret: string;
  /** Comma-separated. e.g. "read_products,write_products,write_files". */
  scopes: string;
  /** Absolute URL on this app, e.g. https://app.listpack.studio/api/shopify/oauth/callback */
  redirectUri: string;
}

function getConfig(): ShopifyOAuthConfig {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const scopes = process.env.SHOPIFY_SCOPES;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  if (!apiKey || !apiSecret || !scopes || !redirectUri) {
    throw new Error(
      'Shopify OAuth env vars missing: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, SHOPIFY_REDIRECT_URI',
    );
  }
  return { apiKey, apiSecret, scopes, redirectUri };
}

/**
 * Validate `shop` query parameter — must look like `*.myshopify.com` with
 * a [-a-z0-9] subdomain. Shops are user-controlled input; this is a
 * server-side guard against SSRF (someone passing `evil.com` to make us
 * POST our client secret elsewhere).
 */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/i.test(shop);
}

export function buildAuthorizeUrl(
  shop: string,
  state: string,
  cfg: ShopifyOAuthConfig = getConfig(),
): string {
  if (!isValidShopDomain(shop)) {
    throw new Error(`invalid shop domain: ${shop}`);
  }
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set('client_id', cfg.apiKey);
  url.searchParams.set('scope', cfg.scopes);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', state);
  // We don't request per-user/online tokens — server-to-server only.
  return url.toString();
}

/**
 * Verify the HMAC signature Shopify attaches to OAuth redirects + webhooks.
 *
 * Algo (per https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant):
 *   - Take all params except `hmac` + `signature`
 *   - Sort lexicographically, encode as `k=v` joined by `&`
 *   - HMAC-SHA256 with API secret
 *   - Compare to the `hmac` param (hex)
 */
export function verifyOAuthHmac(
  params: URLSearchParams,
  cfg: ShopifyOAuthConfig = getConfig(),
): boolean {
  const expected = params.get('hmac');
  if (!expected) return false;

  const filtered: [string, string][] = [];
  for (const [k, v] of params) {
    if (k === 'hmac' || k === 'signature') continue;
    filtered.push([k, v]);
  }
  filtered.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const msg = filtered.map(([k, v]) => `${k}=${v}`).join('&');
  const computed = createHmac('sha256', cfg.apiSecret).update(msg).digest('hex');

  // Constant-time compare; both must be same length to avoid throwing.
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify HMAC + state + shop on the OAuth callback. Returns the parsed
 * payload on success; throws on any mismatch so the caller short-circuits
 * with 400.
 */
export interface VerifiedCallback {
  shop: string;
  code: string;
}

export function verifyOAuthRedirect(
  params: URLSearchParams,
  expectedState: string,
  cfg: ShopifyOAuthConfig = getConfig(),
): VerifiedCallback {
  const code = params.get('code');
  const shop = params.get('shop');
  const state = params.get('state');

  if (!code) throw new Error('missing `code` in OAuth callback');
  if (!shop) throw new Error('missing `shop` in OAuth callback');
  if (!state || state !== expectedState) {
    throw new Error('OAuth state mismatch (CSRF guard)');
  }
  if (!isValidShopDomain(shop)) {
    throw new Error(`invalid shop domain: ${shop}`);
  }
  if (!verifyOAuthHmac(params, cfg)) {
    throw new Error('OAuth HMAC verification failed');
  }
  return { shop, code };
}

/**
 * Exchange a one-time `code` for a permanent admin API access token.
 * Returns `{access_token, scope}` per Shopify's response shape.
 */
export interface ExchangeResult {
  accessToken: string;
  scope: string;
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
  cfg: ShopifyOAuthConfig = getConfig(),
): Promise<ExchangeResult> {
  if (!isValidShopDomain(shop)) {
    throw new Error(`invalid shop domain: ${shop}`);
  }
  const url = `https://${shop}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.apiKey,
      client_secret: cfg.apiSecret,
      code,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Shopify token exchange failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { access_token: string; scope: string };
  return { accessToken: data.access_token, scope: data.scope };
}

export function shopifyAdminApiVersion(): string {
  return SHOPIFY_API_VERSION;
}
