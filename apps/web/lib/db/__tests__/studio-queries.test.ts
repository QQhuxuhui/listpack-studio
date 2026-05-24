/**
 * Integration tests for studio-queries.ts — connects to the real Postgres
 * configured via POSTGRES_URL. Creates a throwaway user/workspace/chat,
 * exercises the helpers, and cleans up at the end. Email/slug are time-
 * stamped so reruns don't collide on the unique indexes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// `studio-queries.ts` (and `drizzle.ts`) import `server-only`, which
// throws when loaded outside Next's bundler. Patch CJS resolution to
// route that specifier to an empty stub BEFORE the modules-under-test
// load. Static imports of those modules below are intentionally absent;
// `before()` loads them dynamically after this patch is installed.
const _require = createRequire(import.meta.url);
type ModuleStatic = typeof import('module') & {
  _resolveFilename: (req: string, ...rest: unknown[]) => string;
};
const _Module = _require('module') as ModuleStatic;
const _origResolve = _Module._resolveFilename.bind(_Module);
_Module._resolveFilename = function patched(
  req: string,
  ...rest: unknown[]
): string {
  if (req === 'server-only') {
    return _require.resolve('./_server-only-stub.cjs');
  }
  return _origResolve(req, ...rest);
};

// Lazily-loaded modules — see before() block.
type Db = typeof import('../drizzle')['db'];
type Client = typeof import('../drizzle')['client'];
type Schema = typeof import('../schema');
type Eq = typeof import('drizzle-orm')['eq'];
type Queries = typeof import('../studio-queries');

let db: Db;
let client: Client;
let schema: Schema;
let eq: Eq;
let queries: Queries;

let tmpUserId: string;
let tmpWorkspaceId: string;
let tmpChatId: string;

before(async () => {
  ({ db, client } = await import('../drizzle'));
  schema = await import('../schema');
  ({ eq } = await import('drizzle-orm'));
  queries = await import('../studio-queries');

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
    chatId: tmpChatId,
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
  // Existing behavior preserved: insert lands in 'generating' status.
  assert.equal(msg.status, 'generating');
});

test('recordUserMessage 支持 parentMessageId', async () => {
  const parent = await queries.createPendingAssistantMessage({
    chatId: tmpChatId,
    model: 'gpt-image-2',
    params: {},
  });
  const child = await queries.recordUserMessage({
    chatId: tmpChatId,
    text: 'reroll test',
    parentMessageId: parent.id,
  });
  assert.equal(child.parentMessageId, parent.id);
  assert.equal(child.text, 'reroll test');
  assert.equal(child.role, 'user');
});

test('cleanup', async () => {
  // image_messages cascade via image_chats, but delete explicitly to avoid
  // FK surprises and keep the cleanup symmetric with setup.
  await db
    .delete(schema.imageMessages)
    .where(eq(schema.imageMessages.chatId, tmpChatId));
  await db.delete(schema.imageChats).where(eq(schema.imageChats.id, tmpChatId));
  await db
    .delete(schema.members)
    .where(eq(schema.members.workspaceId, tmpWorkspaceId));
  await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, tmpWorkspaceId));
  await db.delete(schema.users).where(eq(schema.users.id, tmpUserId));
});

after(async () => {
  // Close the postgres pool so the test process exits cleanly. Without
  // this the idle TCP connections keep the Node event loop alive and the
  // test runner hangs past the final summary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).end?.({ timeout: 2 });
});
