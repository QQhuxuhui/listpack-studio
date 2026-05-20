import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isAdminEmail } from '../admin';

const env = process.env as Record<string, string | undefined>;

test('isAdminEmail returns false when ADMIN_USER_EMAILS is unset', () => {
  delete env.ADMIN_USER_EMAILS;
  assert.equal(isAdminEmail('anyone@example.com'), false);
});

test('isAdminEmail recognises whitelisted emails (case-insensitive)', () => {
  env.ADMIN_USER_EMAILS = 'alice@x.com,bob@x.com';
  assert.equal(isAdminEmail('alice@x.com'), true);
  assert.equal(isAdminEmail('ALICE@X.COM'), true);
  assert.equal(isAdminEmail('bob@x.com'), true);
});

test('isAdminEmail rejects non-listed emails', () => {
  env.ADMIN_USER_EMAILS = 'alice@x.com';
  assert.equal(isAdminEmail('mallory@x.com'), false);
  assert.equal(isAdminEmail(''), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
});

test('isAdminEmail tolerates surrounding whitespace in env list', () => {
  env.ADMIN_USER_EMAILS = '  alice@x.com  , bob@x.com ';
  assert.equal(isAdminEmail('alice@x.com'), true);
  assert.equal(isAdminEmail('bob@x.com'), true);
});

test('isAdminEmail re-reads env on each call (rotation friendly)', () => {
  env.ADMIN_USER_EMAILS = 'alice@x.com';
  assert.equal(isAdminEmail('alice@x.com'), true);
  env.ADMIN_USER_EMAILS = 'bob@x.com';
  // alice rotated out — should now be rejected.
  assert.equal(isAdminEmail('alice@x.com'), false);
  assert.equal(isAdminEmail('bob@x.com'), true);
});
