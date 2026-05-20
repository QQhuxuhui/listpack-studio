import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  buildAuthorizeUrl,
  isValidShopDomain,
  verifyOAuthHmac,
  verifyOAuthRedirect,
} from '../oauth';

const cfg = {
  apiKey: 'apk_test',
  apiSecret: 'shpss_secret_test',
  scopes: 'read_products,write_products,write_files',
  redirectUri: 'https://app.example.com/api/shopify/oauth/callback',
};

test('isValidShopDomain accepts proper *.myshopify.com domains', () => {
  assert.equal(isValidShopDomain('listpack-dev.myshopify.com'), true);
  assert.equal(isValidShopDomain('a.myshopify.com'), true);
});

test('isValidShopDomain rejects spoofed / SSRF-y inputs', () => {
  assert.equal(isValidShopDomain('evil.com'), false);
  assert.equal(isValidShopDomain('shop.myshopify.com.evil.com'), false);
  assert.equal(isValidShopDomain('localhost'), false);
  assert.equal(isValidShopDomain('169.254.169.254'), false);
  assert.equal(isValidShopDomain(''), false);
});

test('buildAuthorizeUrl produces the expected install URL', () => {
  const url = buildAuthorizeUrl('store.myshopify.com', 'state-abc', cfg);
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'store.myshopify.com');
  assert.equal(parsed.pathname, '/admin/oauth/authorize');
  assert.equal(parsed.searchParams.get('client_id'), cfg.apiKey);
  assert.equal(parsed.searchParams.get('scope'), cfg.scopes);
  assert.equal(parsed.searchParams.get('redirect_uri'), cfg.redirectUri);
  assert.equal(parsed.searchParams.get('state'), 'state-abc');
});

test('buildAuthorizeUrl throws on bad shop domain', () => {
  assert.throws(() => buildAuthorizeUrl('evil.com', 'state-abc', cfg));
});

function signParams(params: Record<string, string>) {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort();
  const msg = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  return createHmac('sha256', cfg.apiSecret).update(msg).digest('hex');
}

test('verifyOAuthHmac accepts a correctly-signed payload', () => {
  const params = {
    code: 'abc123',
    shop: 'store.myshopify.com',
    state: 'state-abc',
    timestamp: '1700000000',
  };
  const hmac = signParams(params);
  const search = new URLSearchParams({ ...params, hmac });
  assert.equal(verifyOAuthHmac(search, cfg), true);
});

test('verifyOAuthHmac rejects a tampered payload', () => {
  const params = {
    code: 'abc123',
    shop: 'store.myshopify.com',
    state: 'state-abc',
    timestamp: '1700000000',
  };
  const hmac = signParams(params);
  const search = new URLSearchParams({
    ...params,
    code: 'XYZ999', // changed after signing
    hmac,
  });
  assert.equal(verifyOAuthHmac(search, cfg), false);
});

test('verifyOAuthHmac ignores `signature` field per docs', () => {
  const params = {
    code: 'abc123',
    shop: 'store.myshopify.com',
    state: 'state-abc',
    timestamp: '1700000000',
  };
  const hmac = signParams(params);
  // Add a `signature` param after signing — must not affect verification.
  const search = new URLSearchParams({ ...params, hmac, signature: 'noise' });
  assert.equal(verifyOAuthHmac(search, cfg), true);
});

test('verifyOAuthRedirect returns code+shop on a clean callback', () => {
  const params = {
    code: 'abc123',
    shop: 'store.myshopify.com',
    state: 'state-abc',
    timestamp: '1700000000',
  };
  const search = new URLSearchParams({ ...params, hmac: signParams(params) });
  const out = verifyOAuthRedirect(search, 'state-abc', cfg);
  assert.equal(out.shop, 'store.myshopify.com');
  assert.equal(out.code, 'abc123');
});

test('verifyOAuthRedirect throws on state mismatch (CSRF)', () => {
  const params = {
    code: 'abc123',
    shop: 'store.myshopify.com',
    state: 'attacker-state',
    timestamp: '1700000000',
  };
  const search = new URLSearchParams({ ...params, hmac: signParams(params) });
  assert.throws(
    () => verifyOAuthRedirect(search, 'expected-state', cfg),
    /state mismatch/,
  );
});

test('verifyOAuthRedirect throws on bad shop domain', () => {
  const params = {
    code: 'abc123',
    shop: 'evil.com',
    state: 'state-abc',
    timestamp: '1700000000',
  };
  const search = new URLSearchParams({ ...params, hmac: signParams(params) });
  assert.throws(
    () => verifyOAuthRedirect(search, 'state-abc', cfg),
    /invalid shop domain/,
  );
});

test('verifyOAuthRedirect throws on bad HMAC', () => {
  const search = new URLSearchParams({
    code: 'abc',
    shop: 'store.myshopify.com',
    state: 'state-abc',
    timestamp: '1700000000',
    hmac: 'deadbeef'.repeat(8),
  });
  assert.throws(
    () => verifyOAuthRedirect(search, 'state-abc', cfg),
    /HMAC verification failed/,
  );
});
