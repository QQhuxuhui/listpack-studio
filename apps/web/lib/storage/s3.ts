/**
 * S3 / R2 storage backend.
 *
 * S3-compatible (AWS S3 or Cloudflare R2 — set S3_ENDPOINT for R2).
 * Same interface as LocalFsStorage, just bytes go to object storage
 * instead of disk.
 *
 * Why one class for both AWS and R2: the AWS SDK v3 client speaks
 * either when you swap the endpoint + region. R2 docs at
 * https://developers.cloudflare.com/r2/api/s3/api/ confirm full v3
 * compatibility (including `pathStyle: true` requirement).
 *
 * Env:
 *   S3_BUCKET           — required
 *   S3_REGION           — required (R2: "auto")
 *   S3_ACCESS_KEY_ID    — required
 *   S3_SECRET_ACCESS_KEY — required
 *   S3_ENDPOINT         — optional (set for R2 / MinIO; omit for AWS S3)
 *   S3_PUBLIC_URL_BASE  — optional CDN prefix; when set, publicUrl()
 *                         returns `${base}/${key}` so the agent /
 *                         browser hits CDN instead of going through us
 */

import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PutResult, Storage } from './types';

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicUrlBase?: string;
}

function getConfig(): S3Config {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3Storage requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
    );
  }
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.S3_ENDPOINT,
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE,
  };
}

export class S3Storage implements Storage {
  private _client: S3Client | null = null;
  private _cfg: S3Config | null = null;

  private cfg(): S3Config {
    if (!this._cfg) this._cfg = getConfig();
    return this._cfg;
  }

  private client(): S3Client {
    if (this._client) return this._client;
    const c = this.cfg();
    this._client = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      // R2 requires path-style addressing (bucket in path, not subdomain).
      forcePathStyle: Boolean(c.endpoint),
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
    });
    return this._client;
  }

  async put({
    key,
    bytes,
    mime,
  }: {
    key: string;
    bytes: Buffer;
    mime: string;
  }): Promise<PutResult> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.cfg().bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        // Useful audit fields — match the LocalFsStorage sidecar mime.
        Metadata: { sha256, mime },
      }),
    );
    return {
      storageKey: key,
      cdnUrl: this.cdnUrlFor(key),
      sha256,
      size: bytes.length,
    };
  }

  async get(key: string): Promise<{ bytes: Buffer; mime: string }> {
    const res = await this.client().send(
      new GetObjectCommand({
        Bucket: this.cfg().bucket,
        Key: key,
      }),
    );
    if (!res.Body) throw new Error(`empty body for s3 key ${key}`);
    const chunks: Uint8Array[] = [];
    // S3 SDK v3 returns a node stream; iterate via async iterator. The
    // Body union type doesn't always expose Symbol.asyncIterator at the
    // type level, so we cast — at runtime it's always iterable in Node.
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const mime = res.Metadata?.mime ?? res.ContentType ?? 'application/octet-stream';
    return { bytes, mime };
  }

  async delete(key: string): Promise<void> {
    await this.client().send(
      new DeleteObjectCommand({
        Bucket: this.cfg().bucket,
        Key: key,
      }),
    );
  }

  publicUrl(key: string): string {
    const c = this.cfg();
    if (c.publicUrlBase) {
      // Trim trailing slash to avoid double-slash in joined URL.
      const base = c.publicUrlBase.replace(/\/$/, '');
      return `${base}/${key}`;
    }
    // Same-origin fallback so the existing /api/assets/by-key/{key}/raw
    // route can stream the bytes (useful in dev / when the bucket isn't
    // publicly readable yet).
    return `/api/assets/by-key/${encodeURIComponent(key)}/raw`;
  }

  private cdnUrlFor(key: string): string | null {
    return this.cfg().publicUrlBase
      ? `${this.cfg().publicUrlBase!.replace(/\/$/, '')}/${key}`
      : null;
  }
}
