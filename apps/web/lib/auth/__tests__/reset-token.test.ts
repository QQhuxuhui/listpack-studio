import { test } from 'node:test';
import assert from 'node:assert/strict';

import { signResetToken, verifyResetToken } from '../reset-token';

test('signResetToken / verifyResetToken round-trips a user id', async () => {
  process.env.AUTH_SECRET = 'unit-test-secret-for-reset';
  const token = await signResetToken('user-abc');
  const id = await verifyResetToken(token);
  assert.equal(id, 'user-abc');
});

test('verifyResetToken rejects token signed with different secret', async () => {
  process.env.AUTH_SECRET = 'secret-A';
  const token = await signResetToken('user-1');

  process.env.AUTH_SECRET = 'secret-B';
  await assert.rejects(verifyResetToken(token));
});

test('verifyResetToken rejects session-style tokens (typ mismatch)', async () => {
  process.env.AUTH_SECRET = 'unit-test-secret-for-reset';
  // Hand-craft a JWT signed with the same secret but no `typ:pwreset`.
  const { SignJWT } = await import('jose');
  const otherToken = await new SignJWT({ user: { id: 'u1' } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('unit-test-secret-for-reset'));
  await assert.rejects(verifyResetToken(otherToken), /typ mismatch/);
});

test('verifyResetToken rejects a totally invalid token', async () => {
  process.env.AUTH_SECRET = 'unit-test-secret-for-reset';
  await assert.rejects(verifyResetToken('not.a.jwt'));
});

test('signResetToken refuses to issue when no secret is set', async () => {
  delete process.env.AUTH_SECRET;
  delete process.env.RESET_SECRET;
  await assert.rejects(signResetToken('user-x'), /must be set/);
  // Restore so later tests pass.
  process.env.AUTH_SECRET = 'unit-test-secret-for-reset';
});
