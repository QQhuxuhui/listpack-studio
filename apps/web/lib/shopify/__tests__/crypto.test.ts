import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encryptToken, decryptToken, _resetKeyCache } from '../crypto';

test('encrypt/decrypt round-trips', () => {
  process.env.PLATFORM_TOKEN_ENCRYPTION_KEY = 'unit-test-secret-key-1';
  _resetKeyCache();

  const token = 'shpat_abcdef1234567890_test_token';
  const enc = encryptToken(token);
  assert.notEqual(enc, token, 'cipher should differ from plaintext');
  assert.ok(enc.startsWith('v1:'), 'cipher carries v1 prefix');

  const dec = decryptToken(enc);
  assert.equal(dec, token, 'round-trip recovers plaintext');
});

test('decrypt rejects tampered ciphertext (GCM auth)', () => {
  process.env.PLATFORM_TOKEN_ENCRYPTION_KEY = 'unit-test-secret-key-1';
  _resetKeyCache();

  const enc = encryptToken('hello');
  const parts = enc.split(':');
  // flip a bit in the ciphertext segment
  const bytes = Buffer.from(parts[3]!, 'base64');
  bytes[0]! ^= 0x01;
  const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${bytes.toString('base64')}`;

  assert.throws(() => decryptToken(tampered));
});

test('decrypt under a different key fails', () => {
  process.env.PLATFORM_TOKEN_ENCRYPTION_KEY = 'key-A';
  _resetKeyCache();
  const enc = encryptToken('secret');

  process.env.PLATFORM_TOKEN_ENCRYPTION_KEY = 'key-B';
  _resetKeyCache();
  assert.throws(() => decryptToken(enc));
});

test('refuses to encrypt without any key', () => {
  delete process.env.PLATFORM_TOKEN_ENCRYPTION_KEY;
  delete process.env.AUTH_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  _resetKeyCache();
  assert.throws(() => encryptToken('x'));
});
