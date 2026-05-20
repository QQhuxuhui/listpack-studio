import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  overageWarningEmail,
  trialExpiringEmail,
  welcomeEmail,
} from '../templates';

test('welcomeEmail renders subject + 3-step body + dashboard CTA', () => {
  const out = welcomeEmail({
    to: 'jane@example.com',
    name: 'Jane',
    workspaceName: 'Jane Co',
    dashboardUrl: 'https://app.listpack.studio/dashboard',
  });

  assert.match(out.subject, /Welcome to ListPack Studio/);
  assert.ok(out.text.includes('Hi Jane,'));
  assert.ok(out.html.includes('Jane Co'));
  assert.ok(out.html.includes('https://app.listpack.studio/dashboard'));
  // 3 onboarding steps appear
  assert.ok(out.text.includes('1.') && out.text.includes('2.') && out.text.includes('3.'));
  // Free tier disclosure
  assert.match(out.text, /5 SKUs/);
});

test('welcomeEmail without name uses generic greeting', () => {
  const out = welcomeEmail({
    to: 'anon@example.com',
    workspaceName: 'Ws',
    dashboardUrl: 'https://x/dashboard',
  });
  assert.ok(out.text.startsWith('Hi there,'));
});

test('welcomeEmail HTML escapes user-controlled fields', () => {
  const out = welcomeEmail({
    to: 'x@x.com',
    name: '<script>alert(1)</script>',
    workspaceName: '"><svg/onload=alert(1)>',
    dashboardUrl: 'https://x',
  });
  assert.ok(!out.html.includes('<script>alert(1)</script>'));
  assert.ok(!out.html.includes('<svg/onload'));
});

test('trialExpiringEmail carries 48h notice copy + manage link', () => {
  const out = trialExpiringEmail({
    to: 'a@b.com',
    planName: 'Pro',
    expiresOnIso: '2026-06-01T12:00:00Z',
    manageUrl: 'https://x/manage',
  });
  assert.match(out.subject, /Pro trial ends/);
  assert.match(out.text, /48 hours ahead/);
  assert.ok(out.html.includes('https://x/manage'));
});

test('overageWarningEmail shows quota usage + rate + 3 options', () => {
  const out = overageWarningEmail({
    to: 'a@b.com',
    planName: 'Starter',
    skuUsed: 30,
    skuQuota: 30,
    overagePerSku: 0.8,
    manageUrl: 'https://x/manage',
  });
  assert.match(out.subject, /hit your Starter SKU quota/);
  assert.ok(out.text.includes('30 of 30'));
  assert.ok(out.text.includes('$0.80'));
  // 3 user options
  assert.ok(out.text.includes('Keep going'));
  assert.ok(out.text.includes('Upgrade'));
  assert.ok(out.text.includes('Disable overage'));
});
