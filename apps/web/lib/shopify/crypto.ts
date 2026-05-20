/**
 * AES-256-GCM token encryption for platform_connections.
 *
 * Shopify (and Amazon, eBay etc) hands us a long-lived bearer token. We
 * store it in `platform_connections.encrypted_access_token` so a DB dump
 * doesn't leak working tokens. Key comes from env so it can rotate
 * independently of the DB.
 *
 * Format on disk: `v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`.
 * Versioned so a future re-key migration can branch on prefix.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const KEY_LENGTH = 32; // 256-bit

let _keyCache: Buffer | null = null;

/**
 * Derive a 32-byte key from PLATFORM_TOKEN_ENCRYPTION_KEY via scrypt.
 *
 * Falls back to deriving from STRIPE_SECRET_KEY (shared secret already
 * present in env) for dev convenience — production MUST set its own.
 */
function getKey(): Buffer {
  if (_keyCache) return _keyCache;

  const seed =
    process.env.PLATFORM_TOKEN_ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    process.env.STRIPE_SECRET_KEY;
  if (!seed) {
    throw new Error(
      'PLATFORM_TOKEN_ENCRYPTION_KEY (or AUTH_SECRET / STRIPE_SECRET_KEY as fallback) must be set to encrypt platform tokens.',
    );
  }

  // scrypt with a fixed salt — the *key derivation* doesn't need a unique
  // salt because the salt's job (in PBKDFs) is to defeat rainbow tables
  // on user passwords; here our `seed` is already a high-entropy secret.
  const salt = createHash('sha256').update('listpack:platform-tokens:v1').digest();
  _keyCache = scryptSync(seed, salt, KEY_LENGTH);
  return _keyCache;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptToken(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('encrypted token has unexpected format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Reset the cached key — used by tests after monkey-patching env vars. */
export function _resetKeyCache(): void {
  _keyCache = null;
}
