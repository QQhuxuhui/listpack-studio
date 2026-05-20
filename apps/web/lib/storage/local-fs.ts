/**
 * Local filesystem storage backend — for dev / sandbox.
 *
 * Persists files under `STORAGE_ROOT` (default: <cwd>/storage). Keys are
 * stored as-is (with `/` separators) under the root.
 *
 * Production swaps in S3Storage via `getStorage()` factory.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PutResult, Storage } from './types';

function storageRoot(): string {
  return path.resolve(
    process.cwd(),
    process.env.STORAGE_ROOT ?? 'storage',
  );
}

/**
 * Resolve a storage key to an absolute path while guarding against
 * traversal (`..`) — `key` is workspace + caller-controlled.
 */
function resolveKey(key: string): string {
  const root = storageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error(`storage key escapes root: ${key}`);
  }
  return full;
}

export class LocalFsStorage implements Storage {
  async put({
    key,
    bytes,
    mime,
  }: {
    key: string;
    bytes: Buffer;
    mime: string;
  }): Promise<PutResult> {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // Persist mime as a tiny sidecar so .get() can return it.
    await writeFile(`${full}.mime`, mime, 'utf8');

    return {
      storageKey: key,
      cdnUrl: null,
      sha256,
      size: bytes.length,
    };
  }

  async get(key: string): Promise<{ bytes: Buffer; mime: string }> {
    const full = resolveKey(key);
    const [bytes, mime] = await Promise.all([
      readFile(full),
      readFile(`${full}.mime`, 'utf8').catch(() => 'application/octet-stream'),
    ]);
    return { bytes, mime };
  }

  async delete(key: string): Promise<void> {
    const full = resolveKey(key);
    await Promise.all([
      unlink(full).catch(() => undefined),
      unlink(`${full}.mime`).catch(() => undefined),
    ]);
  }

  publicUrl(key: string): string {
    // Same-origin streaming route — see app/api/assets/[id]/raw.
    return `/api/assets/by-key/${encodeURIComponent(key)}/raw`;
  }
}
