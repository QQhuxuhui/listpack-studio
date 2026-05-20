import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapStripeProductToPlan, getPlan, publicPlans } from '../plans';

// These tests exercise the catalog-side mapping logic the Stripe webhook
// relies on. The actual webhook + DB writes need a live DB and are
// integration-tested via apps/agent's PG suite — here we just guarantee
// the catalog is wired correctly so handleSubscriptionChange resolves
// Stripe products to the right plan + quota.

test('mapStripeProductToPlan recognises every catalog tier', () => {
  for (const plan of publicPlans()) {
    assert.equal(
      mapStripeProductToPlan(plan.stripeProductName),
      plan.id,
      `expected "${plan.stripeProductName}" → ${plan.id}`,
    );
  }
});

test('mapStripeProductToPlan returns null for unknown Stripe products', () => {
  assert.equal(mapStripeProductToPlan('Mystery promo'), null);
  assert.equal(mapStripeProductToPlan(''), null);
});

test('catalog quota matches PRD § 00 § 5.1', () => {
  // PRD pin: these numbers drive billing — break this test if you change
  // pricing without updating the PRD.
  assert.equal(getPlan('free').skuQuota, 5);
  assert.equal(getPlan('starter').skuQuota, 30);
  assert.equal(getPlan('pro').skuQuota, 100);
  assert.equal(getPlan('brand').skuQuota, 500);
});

test('free plan disallows overage (per PRD § 5.1)', () => {
  assert.equal(getPlan('free').overagePerSkuUsd, null);
});

test('paid plan overage rates step down with tier', () => {
  // Starter $0.80 > Pro $0.50 > Brand $0.30 — encourages upgrades.
  const s = getPlan('starter').overagePerSkuUsd!;
  const p = getPlan('pro').overagePerSkuUsd!;
  const b = getPlan('brand').overagePerSkuUsd!;
  assert.ok(s > p && p > b, `expected ${s} > ${p} > ${b}`);
});
