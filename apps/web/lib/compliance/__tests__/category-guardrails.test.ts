import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORIES,
  getCategory,
  isCategoryRunnable,
  publicCategories,
} from '../category-guardrails';

test('PRD § 00 § 3.3 red-line categories are all blocked', () => {
  // From PRD: 保健品 / 医美 / 珠宝 / 食品
  for (const id of [
    'supplements',
    'pet_supplements',
    'medical',
    'medical_aesthetic',
    'food',
    'jewelry',
  ]) {
    const cat = getCategory(id);
    assert.ok(cat, `category ${id} should be defined`);
    assert.equal(cat?.risk, 'blocked', `${id} should be risk=blocked`);
    assert.ok(cat?.reason, `${id} must explain why it's blocked`);
  }
});

test('PRD-supported v1 categories are runnable', () => {
  for (const id of ['apparel', 'home_goods', 'electronics', 'accessories']) {
    const cat = getCategory(id);
    assert.ok(cat);
    assert.equal(cat?.risk, 'supported');
    assert.equal(isCategoryRunnable(id), true);
  }
});

test('isCategoryRunnable rejects blocked, allows caution + supported + null', () => {
  assert.equal(isCategoryRunnable('supplements'), false);
  assert.equal(isCategoryRunnable('food'), false);
  assert.equal(isCategoryRunnable('jewelry'), false);

  assert.equal(isCategoryRunnable('kids_toys'), true); // caution allowed
  assert.equal(isCategoryRunnable('apparel'), true);
  assert.equal(isCategoryRunnable(null), true);
  assert.equal(isCategoryRunnable(undefined), true);
  // Unknown id: defensive — allow rather than wall off legit users with typos
  assert.equal(isCategoryRunnable('mystery_new_thing'), true);
});

test('caution categories explain why', () => {
  const c = getCategory('kids_toys');
  assert.equal(c?.risk, 'caution');
  assert.ok(c?.reason && c.reason.length > 20);
});

test('publicCategories returns the full list (no hidden ones)', () => {
  assert.equal(publicCategories().length, CATEGORIES.length);
});

test('no duplicate category ids', () => {
  const ids = CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});
