/**
 * Storage factory — picks the right backend based on env.
 *
 * Set `STORAGE_BACKEND=s3` once we wire S3Storage; defaults to local FS.
 */

import { LocalFsStorage } from './local-fs';
import type { Storage } from './types';

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;

  const backend = (process.env.STORAGE_BACKEND ?? 'local').toLowerCase();
  switch (backend) {
    case 's3':
      throw new Error(
        'STORAGE_BACKEND=s3 not yet implemented — set STORAGE_BACKEND=local',
      );
    case 'local':
    default:
      _storage = new LocalFsStorage();
      return _storage;
  }
}

export type { Storage, PutResult } from './types';
