/**
 * Storage factory — picks the right backend based on env.
 *
 * Set `STORAGE_BACKEND=s3` once we wire S3Storage; defaults to local FS.
 */

import { LocalFsStorage } from './local-fs';
import { S3Storage } from './s3';
import type { Storage } from './types';

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;

  const backend = (process.env.STORAGE_BACKEND ?? 'local').toLowerCase();
  switch (backend) {
    case 's3':
    case 'r2':
      _storage = new S3Storage();
      return _storage;
    case 'local':
    default:
      _storage = new LocalFsStorage();
      return _storage;
  }
}

/** Test helper — reset the cached singleton between tests. */
export function _resetStorageCache(): void {
  _storage = null;
}

export type { Storage, PutResult } from './types';
