import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zhCN } from '../dictionaries/zh-CN';
// Import from the pure registry — `../dictionary` would pull in
// `server-only`, which Node refuses to load outside Next's bundler.
import { fmt, getDictionarySync } from '../dictionary-registry';
import { LOCALES, isLocale } from '../types';

test('LOCALES contains only zh-CN', () => {
  assert.deepEqual([...LOCALES], ['zh-CN']);
});

test('isLocale narrows correctly', () => {
  assert.equal(isLocale('zh-CN'), true);
  assert.equal(isLocale('en'), false);
  assert.equal(isLocale('fr'), false);
  assert.equal(isLocale(''), false);
  assert.equal(isLocale(undefined), false);
  assert.equal(isLocale(null), false);
});

test('every value in the zh-CN dictionary is a non-empty string', () => {
  function walk(obj: Record<string, unknown>, path: string) {
    for (const [k, v] of Object.entries(obj)) {
      const here = path ? `${path}.${k}` : k;
      if (v && typeof v === 'object') {
        walk(v as Record<string, unknown>, here);
      } else {
        assert.equal(typeof v, 'string', `${here} should be string`);
        assert.ok((v as string).length > 0, `${here} should be non-empty`);
      }
    }
  }
  walk(zhCN as unknown as Record<string, unknown>, '');
});

test('getDictionarySync returns the zh-CN dictionary', () => {
  assert.equal(getDictionarySync('zh-CN').common.sign_in, '登录');
});

test('fmt replaces {key} placeholders', () => {
  assert.equal(fmt('{n} 天免费试用', { n: 7 }), '7 天免费试用');
  assert.equal(fmt('${rate}/SKU', { rate: 0.5 }), '$0.5/SKU');
  // Missing placeholder stays literal so we notice during QA.
  assert.equal(fmt('你好 {name}'), '你好 {name}');
});
