import { test } from 'node:test';
import assert from 'node:assert/strict';

import { en } from '../dictionaries/en';
import { zhCN } from '../dictionaries/zh-CN';
// Import from the pure registry — `../dictionary` would pull in
// `server-only`, which Node refuses to load outside Next's bundler.
import { fmt, getDictionarySync } from '../dictionary-registry';
import { LOCALES, isLocale } from '../types';

test('LOCALES contains exactly the two supported languages', () => {
  assert.deepEqual([...LOCALES].sort(), ['en', 'zh-CN'].sort());
});

test('isLocale narrows correctly', () => {
  assert.equal(isLocale('en'), true);
  assert.equal(isLocale('zh-CN'), true);
  assert.equal(isLocale('fr'), false);
  assert.equal(isLocale(''), false);
  assert.equal(isLocale(undefined), false);
  assert.equal(isLocale(null), false);
});

test('en + zh dictionaries share the same top-level + nested keys', () => {
  function keyShape(obj: Record<string, unknown>): string {
    const out: string[] = [];
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (v && typeof v === 'object') {
        out.push(`${k}{${keyShape(v as Record<string, unknown>)}}`);
      } else {
        out.push(k);
      }
    }
    return out.join(',');
  }
  assert.equal(
    keyShape(en as unknown as Record<string, unknown>),
    keyShape(zhCN as unknown as Record<string, unknown>),
    'zh-CN dictionary is missing keys vs en',
  );
});

test('every value in both dictionaries is a non-empty string', () => {
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
  walk(en as unknown as Record<string, unknown>, '');
  walk(zhCN as unknown as Record<string, unknown>, '');
});

test('placeholders in en + zh strings match exactly', () => {
  function placeholders(s: string): string[] {
    return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
  }
  function walk(
    enObj: Record<string, unknown>,
    zhObj: Record<string, unknown>,
    path: string,
  ) {
    for (const k of Object.keys(enObj)) {
      const here = path ? `${path}.${k}` : k;
      const ev = enObj[k];
      const zv = zhObj[k];
      if (ev && typeof ev === 'object') {
        walk(
          ev as Record<string, unknown>,
          zv as Record<string, unknown>,
          here,
        );
      } else {
        assert.deepEqual(
          placeholders(ev as string),
          placeholders(zv as string),
          `placeholders mismatch at ${here}`,
        );
      }
    }
  }
  walk(
    en as unknown as Record<string, unknown>,
    zhCN as unknown as Record<string, unknown>,
    '',
  );
});

test('getDictionarySync returns the right dictionary', () => {
  assert.equal(getDictionarySync('en').common.sign_in, 'Sign in');
  assert.equal(getDictionarySync('zh-CN').common.sign_in, '登录');
});

test('fmt replaces {key} placeholders', () => {
  assert.equal(fmt('{n}-day free trial', { n: 7 }), '7-day free trial');
  assert.equal(fmt('${rate}/SKU', { rate: 0.5 }), '$0.5/SKU');
  // Missing placeholder stays literal so we notice during QA.
  assert.equal(fmt('Hello {name}'), 'Hello {name}');
});
