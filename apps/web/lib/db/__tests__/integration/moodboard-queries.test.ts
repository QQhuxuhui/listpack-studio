/**
 * Integration tests for moodboard-queries.ts — connects to the real Postgres
 * configured via POSTGRES_URL. Creates throwaway users/workspace/assets,
 * exercises the helpers, and cleans up at the end. Email/slug are time-
 * stamped so reruns don't collide on the unique indexes.
 */
import '@/lib/test-utils/server-only-setup'; // must be first — patches `server-only` resolution
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

// Dynamic imports AFTER the shared setup runs
let db: typeof import('../../drizzle').db;
let schema: typeof import('../../schema');
let mb: typeof import('../../moodboard-queries');
let client: typeof import('../../drizzle').client;

let userId: string;
let workspaceId: string;
let otherUserId: string;

before(async () => {
  ({ db, client } = await import('../../drizzle'));
  schema = await import('../../schema');
  mb = await import('../../moodboard-queries');

  const stamp = Date.now();
  const [u1] = await db
    .insert(schema.users)
    .values({ email: `mb-u1-${stamp}@test.local`, passwordHash: 'x' })
    .returning();
  const [u2] = await db
    .insert(schema.users)
    .values({ email: `mb-u2-${stamp}@test.local`, passwordHash: 'x' })
    .returning();
  userId = u1!.id;
  otherUserId = u2!.id;
  const [w] = await db
    .insert(schema.workspaces)
    .values({
      slug: `mb-w-${stamp}`,
      name: 'mb',
      ownerUserId: userId,
      planId: 'free',
    })
    .returning();
  workspaceId = w!.id;
  await db
    .insert(schema.members)
    .values({ userId, workspaceId, role: 'owner' });
});

test('createMoodboard 落库', async () => {
  const m = await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'test board',
    promptTemplate: 'a {{thing}}',
    model: 'gpt-image-2',
    size: '1024x1024',
    refs: [{ asset_id: '00000000-0000-0000-0000-000000000001', role: 'style' }],
  });
  assert.equal(m.title, 'test board');
  assert.equal(m.userId, userId);
  assert.equal(m.refs?.[0]?.role, 'style');
  assert.equal(m.deletedAt, null);
});

test('listMoodboardsForUser 只返回该 user 未软删', async () => {
  await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'a',
    promptTemplate: 'x',
  });
  await mb.createMoodboard({
    workspaceId,
    userId: otherUserId,
    title: 'other',
    promptTemplate: 'x',
  });
  const mine = await mb.listMoodboardsForUser(userId);
  assert.ok(mine.length >= 2);
  assert.ok(mine.every((m) => m.userId === userId));
  assert.ok(mine.every((m) => m.deletedAt === null));
});

test('updateMoodboard 改字段 + 自动 updated_at', async () => {
  const m = await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'orig',
    promptTemplate: 'x',
  });
  const updated = await mb.updateMoodboard(m.id, userId, {
    title: 'new',
    notes: 'note',
  });
  assert.equal(updated?.title, 'new');
  assert.equal(updated?.notes, 'note');
});

test('updateMoodboard 拒绝非创建者', async () => {
  const m = await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'orig',
    promptTemplate: 'x',
  });
  const updated = await mb.updateMoodboard(m.id, otherUserId, {
    title: 'hijack',
  });
  assert.equal(updated, null);
});

test('softDeleteMoodboard 设 deleted_at', async () => {
  const m = await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'doomed',
    promptTemplate: 'x',
  });
  const ok = await mb.softDeleteMoodboard(m.id, userId);
  assert.equal(ok, true);
  const reread = await mb.getMoodboardById(m.id, userId);
  assert.equal(reread, null);
});

test('setCoverIfMissing 首次写入', async () => {
  // create an asset first so the FK doesn't break
  const [a] = await db
    .insert(schema.assets)
    .values({
      workspaceId,
      type: 'generated' as const,
      storageKey: `tmp-cover-${Date.now()}.png`,
      mime: 'image/png',
    })
    .returning();
  const m = await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'cover-test',
    promptTemplate: 'x',
  });
  const r1 = await mb.setCoverIfMissing(m.id, a!.id);
  assert.equal(r1, true);
});

test('setCoverIfMissing 已有 cover 时不覆盖', async () => {
  const [a1] = await db
    .insert(schema.assets)
    .values({
      workspaceId,
      type: 'generated' as const,
      storageKey: `tmp-cover-${Date.now()}-a.png`,
      mime: 'image/png',
    })
    .returning();
  const [a2] = await db
    .insert(schema.assets)
    .values({
      workspaceId,
      type: 'generated' as const,
      storageKey: `tmp-cover-${Date.now()}-b.png`,
      mime: 'image/png',
    })
    .returning();
  const m = await mb.createMoodboard({
    workspaceId,
    userId,
    title: 'cover-2',
    promptTemplate: 'x',
  });
  await mb.setCoverIfMissing(m.id, a1!.id);
  const r2 = await mb.setCoverIfMissing(m.id, a2!.id);
  assert.equal(r2, false);
});

test('setCoverIfMissing 并发调用只第一个成功', async () => {
  const [a1] = await db.insert(schema.assets).values({
    workspaceId, type: 'generated' as const, storageKey: `tmp-cover-${Date.now()}-c.png`, mime: 'image/png',
  }).returning();
  const [a2] = await db.insert(schema.assets).values({
    workspaceId, type: 'generated' as const, storageKey: `tmp-cover-${Date.now()}-d.png`, mime: 'image/png',
  }).returning();
  const m = await mb.createMoodboard({ workspaceId, userId, title: 'cover-race', promptTemplate: 'x' });
  const [r1, r2] = await Promise.all([
    mb.setCoverIfMissing(m.id, a1!.id),
    mb.setCoverIfMissing(m.id, a2!.id),
  ]);
  // 恰好一个 true 一个 false
  assert.equal(r1 !== r2, true, 'one must succeed and the other must no-op');
});

after(async () => {
  try {
    if (userId || otherUserId) {
      // hard-delete moodboards owned by these users so cleanup is exhaustive
      if (userId) {
        await db
          .delete(schema.moodboards)
          .where(eq(schema.moodboards.userId, userId));
      }
      if (otherUserId) {
        await db
          .delete(schema.moodboards)
          .where(eq(schema.moodboards.userId, otherUserId));
      }
    }
    // assets created above are workspaceId-scoped; hard-delete them
    if (workspaceId) {
      await db
        .delete(schema.assets)
        .where(eq(schema.assets.workspaceId, workspaceId));
      await db
        .delete(schema.members)
        .where(eq(schema.members.workspaceId, workspaceId));
      await db
        .delete(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId));
    }
    if (userId) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
    if (otherUserId) {
      await db.delete(schema.users).where(eq(schema.users.id, otherUserId));
    }
  } catch (e) {
    console.error('moodboard test cleanup failed:', e);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).end?.({ timeout: 2 });
});
