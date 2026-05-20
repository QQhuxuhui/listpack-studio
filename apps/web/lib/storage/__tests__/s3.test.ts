import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S3Storage } from '../s3';

const env = process.env as Record<string, string | undefined>;

function withCleanEnv<T>(fn: () => T | Promise<T>): Promise<T> {
  const saved = { ...env };
  for (const k of [
    'S3_BUCKET',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_ENDPOINT',
    'S3_PUBLIC_URL_BASE',
  ]) {
    delete env[k];
  }
  return Promise.resolve(fn()).finally(() => {
    Object.assign(env, saved);
  });
}

test('S3Storage requires all four core env vars', async () => {
  await withCleanEnv(async () => {
    const s = new S3Storage();
    await assert.rejects(
      s.put({ key: 'k', bytes: Buffer.from('x'), mime: 'image/png' }),
      /S3Storage requires S3_BUCKET/,
    );
  });
});

test('publicUrl falls back to same-origin route when no CDN base', async () => {
  await withCleanEnv(async () => {
    env.S3_BUCKET = 'b';
    env.S3_REGION = 'us-east-1';
    env.S3_ACCESS_KEY_ID = 'a';
    env.S3_SECRET_ACCESS_KEY = 's';
    const s = new S3Storage();
    const url = s.publicUrl('workspaces/abc/assets/x.png');
    assert.match(url, /^\/api\/assets\/by-key\//);
    assert.ok(url.includes('workspaces%2Fabc%2Fassets%2Fx.png'));
  });
});

test('publicUrl prefixes S3_PUBLIC_URL_BASE when configured', async () => {
  await withCleanEnv(async () => {
    env.S3_BUCKET = 'b';
    env.S3_REGION = 'auto';
    env.S3_ACCESS_KEY_ID = 'a';
    env.S3_SECRET_ACCESS_KEY = 's';
    env.S3_PUBLIC_URL_BASE = 'https://cdn.listpack.studio';
    const s = new S3Storage();
    assert.equal(
      s.publicUrl('workspaces/w/assets/a.jpg'),
      'https://cdn.listpack.studio/workspaces/w/assets/a.jpg',
    );
  });
});

test('publicUrl trims trailing slash from CDN base', async () => {
  await withCleanEnv(async () => {
    env.S3_BUCKET = 'b';
    env.S3_REGION = 'auto';
    env.S3_ACCESS_KEY_ID = 'a';
    env.S3_SECRET_ACCESS_KEY = 's';
    env.S3_PUBLIC_URL_BASE = 'https://cdn.x/';
    const s = new S3Storage();
    assert.equal(s.publicUrl('k'), 'https://cdn.x/k');
  });
});
