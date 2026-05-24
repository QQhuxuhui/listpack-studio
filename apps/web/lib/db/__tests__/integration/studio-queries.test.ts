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

after(async () => {
  // Tear down regardless of prior test failure so the dev DB doesn't
  // accumulate orphan rows. Wrapped in try/catch so a FK surprise still
  // lets us close the pool below.
  try {
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
