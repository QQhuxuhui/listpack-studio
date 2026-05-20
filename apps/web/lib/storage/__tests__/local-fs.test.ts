import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { LocalFsStorage } from '../local-fs';

function withTempRoot<T>(fn: () => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), 'listpack-storage-'));
  process.env.STORAGE_ROOT = dir;
  return Promise.resolve(fn()).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

test('LocalFsStorage put/get round-trips bytes + mime', async () => {
  await withTempRoot(async () => {
    const s = new LocalFsStorage();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const put = await s.put({
      key: 'workspaces/w1/assets/a1.jpg',
      bytes,
      mime: 'image/jpeg',
    });

    assert.equal(put.storageKey, 'workspaces/w1/assets/a1.jpg');
    assert.equal(put.size, bytes.length);
    assert.ok(put.sha256.length === 64, 'sha256 hex is 64 chars');

    const got = await s.get('workspaces/w1/assets/a1.jpg');
    assert.deepEqual(got.bytes, bytes);
    assert.equal(got.mime, 'image/jpeg');
  });
});

test('LocalFsStorage rejects path-traversal keys', async () => {
  await withTempRoot(async () => {
    const s = new LocalFsStorage();
    await assert.rejects(
      s.put({ key: '../escape.png', bytes: Buffer.from('x'), mime: 'image/png' }),
      /escapes root/,
    );
  });
});

test('LocalFsStorage publicUrl encodes key', () => {
  const s = new LocalFsStorage();
  const url = s.publicUrl('workspaces/abc/assets/xyz.jpg');
  assert.match(url, /^\/api\/assets\/by-key\//);
  assert.ok(url.includes('workspaces%2Fabc%2Fassets%2Fxyz.jpg'));
});

test('LocalFsStorage delete removes both bytes + mime sidecar', async () => {
  await withTempRoot(async () => {
    const s = new LocalFsStorage();
    await s.put({
      key: 'workspaces/w/assets/a.png',
      bytes: Buffer.from('hello'),
      mime: 'image/png',
    });
    await s.delete('workspaces/w/assets/a.png');
    await assert.rejects(s.get('workspaces/w/assets/a.png'));
  });
});
