/**
 * Storage backend interface — pluggable so dev can use local FS and prod
 * can swap in S3/R2 without touching call sites.
 *
 * Keys are URL-safe paths under a workspace prefix:
 *   workspaces/{workspaceId}/assets/{assetId}.{ext}
 *
 * Implementations:
 *   - LocalFsStorage  (dev / sandbox; persists to ./storage on disk)
 *   - S3Storage       (TODO — wraps @aws-sdk/client-s3)
 */

export interface PutResult {
  /** Opaque storage key — caller persists this on assets.storage_key. */
  storageKey: string;
  /** Optional CDN-cached URL the backend can return; null for local FS. */
  cdnUrl: string | null;
  /** SHA-256 hex of the bytes, computed during put. */
  sha256: string;
  /** Byte length stored. */
  size: number;
}

export interface Storage {
  /** Upload `bytes` under `key`. Returns sha256 + persisted URL. */
  put(args: {
    key: string;
    bytes: Buffer;
    mime: string;
  }): Promise<PutResult>;

  /** Read previously-stored bytes. Throws if missing. */
  get(key: string): Promise<{ bytes: Buffer; mime: string }>;

  delete(key: string): Promise<void>;

  /**
   * URL the agent service (or Shopify) can fetch from. For LocalFS this is
   * a same-origin `/api/assets/<id>/raw` route. For S3 it'll be a signed URL.
   */
  publicUrl(key: string): string;
}
