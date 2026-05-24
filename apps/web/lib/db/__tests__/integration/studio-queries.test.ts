/**
 * Integration tests for studio-queries.ts — connects to the real Postgres
 * configured via POSTGRES_URL. Creates a throwaway user/workspace/chat,
 * exercises the helpers, and cleans up at the end. Email/slug are time-
 * stamped so reruns don't collide on the unique indexes.
 */
import '@/lib/test-utils/server-only-setup'; // must be first — patches `server-only` resolution
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Lazily-loaded modules — see before() block. Static imports of
// server-only modules are intentionally absent so the resolver patch
// from the shared setup runs before they load.
type Db = typeof import('../../drizzle')['db'];
type Client = typeof import('../../drizzle')['client'];
type Schema = typeof import('../../schema');
type Eq = typeof import('drizzle-orm')['eq'];
type Queries = typeof import('../../studio-queries');

let db: Db;
let client: Client;
let schema: Schema;
let eq: Eq;
let queries: Queries;

let tmpUserId: string | undefined;
let tmpWorkspaceId: string | undefined;
let tmpChatId: string | undefined;
// Tests that need a clean message timeline create their own chats and push
// the id here so cleanup can sweep them. Avoids ordering brittleness when
// `getRecentChatMessagesForContext` / latest-assistant queries share state.
const extraChatIds: string[] = [];

before(async () => {
  ({ db, client } = await import('../../drizzle'));
  schema = await import('../../schema');
  ({ eq } = await import('drizzle-orm'));
  queries = await import('../../studio-queries');

  const stamp = Date.now();
  const [u] = await db
    .insert(schema.users)
    .values({ email: `tmp+${stamp}@test.local`, passwordHash: 'x' })
    .returning();
  tmpUserId = u!.id;
  const [w] = await db
    .insert(schema.workspaces)
    .values({
      slug: `tmp-${stamp}`,
      name: 'tmp',
      ownerUserId: tmpUserId,
      planId: 'free',
    })
    .returning();
  tmpWorkspaceId = w!.id;
  await db.insert(schema.members).values({
    userId: tmpUserId,
    workspaceId: tmpWorkspaceId,
    role: 'owner',
  });
  const [c] = await db
    .insert(schema.imageChats)
    .values({
      workspaceId: tmpWorkspaceId,
      userId: tmpUserId,
      title: 'tmp',
    })
    .returning();
  tmpChatId = c!.id;
});

test('createPendingAssistantMessage 写入 refs jsonb', async () => {
  const msg = await queries.createPendingAssistantMessage({
    chatId: tmpChatId!,
    model: 'gpt-image-2',
    params: { n: 1 },
    refs: [
      { asset_id: '00000000-0000-0000-0000-000000000001', role: 'content' },
      { asset_id: '00000000-0000-0000-0000-000000000002', role: 'style' },
    ],
  });
  assert.equal(msg.refs?.length, 2);
  assert.equal(msg.refs?.[0]?.role, 'content');
  assert.equal(msg.refs?.[1]?.role, 'style');
  // Name says "Pending" — status should match. UI handles both
  // 'pending' and 'generating' for the spinner, so this is safe.
  assert.equal(msg.status, 'pending');
});

test('recordUserMessage 支持 parentMessageId', async () => {
  const parent = await queries.createPendingAssistantMessage({
    chatId: tmpChatId!,
    model: 'gpt-image-2',
    params: {},
  });
  const child = await queries.recordUserMessage({
    chatId: tmpChatId!,
    text: 'reroll test',
    parentMessageId: parent.id,
  });
  assert.equal(child.parentMessageId, parent.id);
  assert.equal(child.text, 'reroll test');
  assert.equal(child.role, 'user');
});

// Spin up a fresh chat under the shared workspace/user so tests that depend
// on a clean message timeline don't observe rows from earlier tests.
async function freshChat(): Promise<string> {
  const [c] = await db
    .insert(schema.imageChats)
    .values({
      workspaceId: tmpWorkspaceId!,
      userId: tmpUserId!,
      title: 'tmp-isolated',
    })
    .returning();
  const id = c!.id;
  extraChatIds.push(id);
  return id;
}

test('getMessageByIdForChat 同 chat 返回行,跨 chat 返回 null', async () => {
  const chatA = await freshChat();
  const chatB = await freshChat();
  const msg = await queries.createPendingAssistantMessage({
    chatId: chatA,
    model: 'gpt-image-2',
    params: {},
  });
  const found = await queries.getMessageByIdForChat(msg.id, chatA);
  assert.ok(found, 'same-chat lookup should return a row');
  assert.equal(found!.id, msg.id);

  const crossChat = await queries.getMessageByIdForChat(msg.id, chatB);
  assert.equal(crossChat, null, 'cross-chat lookup should return null');

  const missing = await queries.getMessageByIdForChat(
    '00000000-0000-0000-0000-000000000099',
    chatA,
  );
  assert.equal(missing, null, 'missing id should return null');
});

test('getRecentChatMessagesForContext 时间正序 + 只 completed + 受 limit 限制', async () => {
  const chatId = await freshChat();
  // recordUserMessage inserts with status='completed' + completedAt=now.
  // Sequential awaits guarantee strictly increasing createdAt.
  await queries.recordUserMessage({ chatId, text: 'a' });
  await queries.recordUserMessage({ chatId, text: 'b' });
  await queries.recordUserMessage({ chatId, text: 'c' });
  // A pending assistant row should be filtered out by the status='completed'
  // predicate — proves the filter works without needing a manual failed UPDATE.
  await queries.createPendingAssistantMessage({
    chatId,
    model: 'gpt-image-2',
    params: {},
  });

  const recent = await queries.getRecentChatMessagesForContext(chatId, 2);
  // limit=2 → newest 2 completed (b, c) returned in time-ascending order.
  assert.equal(recent.length, 2);
  assert.equal(recent[0]?.text, 'b');
  assert.equal(recent[1]?.text, 'c');

  const all = await queries.getRecentChatMessagesForContext(chatId, 10);
  // The pending assistant message must not show up.
  assert.equal(all.length, 3, 'pending messages must be excluded');
  assert.deepEqual(
    all.map((m) => m.text),
    ['a', 'b', 'c'],
  );
});

test('getFirstOutputAssetOfLatestCompletedAssistant 返回首张输出', async () => {
  const chatId = await freshChat();
  // No completed assistant yet → null.
  const empty =
    await queries.getFirstOutputAssetOfLatestCompletedAssistant(chatId);
  assert.equal(empty, null);

  // Older completed assistant — should be ignored in favour of the newer one.
  const older = await queries.createPendingAssistantMessage({
    chatId,
    model: 'gpt-image-2',
    params: {},
  });
  await db
    .update(schema.imageMessages)
    .set({
      status: 'completed',
      outputAssetIds: ['00000000-0000-0000-0000-000000000aaa'],
      completedAt: new Date(),
    })
    .where(eq(schema.imageMessages.id, older.id));

  const newer = await queries.createPendingAssistantMessage({
    chatId,
    model: 'gpt-image-2',
    params: {},
  });
  await db
    .update(schema.imageMessages)
    .set({
      status: 'completed',
      outputAssetIds: [
        '00000000-0000-0000-0000-000000000111',
        '00000000-0000-0000-0000-000000000222',
      ],
      completedAt: new Date(),
    })
    .where(eq(schema.imageMessages.id, newer.id));

  const id = await queries.getFirstOutputAssetOfLatestCompletedAssistant(chatId);
  assert.equal(id, '00000000-0000-0000-0000-000000000111');
});

after(async () => {
  // Tear down regardless of prior test failure so the dev DB doesn't
  // accumulate orphan rows. Wrapped in try/catch so a FK surprise still
  // lets us close the pool below.
  try {
    // Wipe per-test fresh chats first (messages cascade via chat FK, but we
    // delete explicitly to mirror setup).
    for (const id of extraChatIds) {
      await db
        .delete(schema.imageMessages)
        .where(eq(schema.imageMessages.chatId, id));
      await db.delete(schema.imageChats).where(eq(schema.imageChats.id, id));
    }
    if (tmpChatId) {
      // image_messages cascade via image_chats, but delete explicitly
      // to keep cleanup symmetric with setup.
      await db
        .delete(schema.imageMessages)
        .where(eq(schema.imageMessages.chatId, tmpChatId));
      await db
        .delete(schema.imageChats)
        .where(eq(schema.imageChats.id, tmpChatId));
    }
    if (tmpWorkspaceId) {
      await db
        .delete(schema.members)
        .where(eq(schema.members.workspaceId, tmpWorkspaceId));
      await db
        .delete(schema.workspaces)
        .where(eq(schema.workspaces.id, tmpWorkspaceId));
    }
    if (tmpUserId) {
      await db.delete(schema.users).where(eq(schema.users.id, tmpUserId));
    }
  } catch (e) {
    console.error('integration cleanup failed:', e);
  }
  // Close the postgres pool so the test process exits cleanly. Without
  // this the idle TCP connections keep the Node event loop alive and the
  // test runner hangs past the final summary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).end?.({ timeout: 2 });
});
