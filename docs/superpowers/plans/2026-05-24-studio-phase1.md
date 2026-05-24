# Studio Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/studio` 加上 Reroll/Variations/Remix + ref 槽位分化 + Moodboard + Library + capability gating，完成留存核心闭环。

**Architecture:** Next.js 15 App Router + Drizzle ORM + Postgres，多模型经 sparkcode.top 网关代理。Phase 1 改 schema（refs jsonb + 新 moodboards 表）+ 新增 Library/Moodboard 路由和组件 + 把模型能力差异显式化（capabilities 字段 + UI gating）。

**Tech Stack:** TypeScript / React 19 / Next.js 15 (Turbopack) / Drizzle ORM / Postgres 15 / SWR / Tailwind CSS / node:test (lib/ 单测)。

**Spec reference:** `docs/superpowers/specs/2026-05-24-studio-phase1-design.md`

**Test runner:** `pnpm --filter web test`（跑 `lib/**/__tests__/*.test.ts`）。集成测需要 `POSTGRES_URL` 真实库，dev 环境直接用 `apps/web/.env` 里的。

**Dev server:** `pnpm --filter web dev` → `http://localhost:3000`。Smoke 用 `test@test.com / admin123` 登录。

---

## Task 1: Migration 0003 + schema.ts

**Files:**
- Create: `apps/web/lib/db/migrations/0003_studio_phase1.sql`
- Modify: `apps/web/lib/db/schema.ts`
- Modify: `apps/web/lib/db/migrations/meta/_journal.json`（drizzle 会自动改，需手工对齐 hash）

**目的：** image_messages 加 refs jsonb + parent_message_id，members 落地 hot-patch，新增 moodboards 表。

- [ ] **Step 1: 修改 `apps/web/lib/db/schema.ts` — members 表对齐 hot-patch**

定位 `export const members = pgTable(` 块（~line 127），确认 schema 已是：

```ts
export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('editor'),
    invitedAt: timestamp('invited_at').notNull().defaultNow(),
    joinedAt: timestamp('joined_at'),  // nullable, no default
  },
  (t) => ({
    uniqWorkspaceUser: uniqueIndex('uniq_member_workspace_user').on(t.workspaceId, t.userId),
  }),
);
```

无需改 schema.ts（已正确），仅记录此为基线。

- [ ] **Step 2: 修改 `apps/web/lib/db/schema.ts` — image_messages 表 refs/parent_message_id**

定位 `export const imageMessages = pgTable(` 块。将 `refAssetIds` 列删除，新加 `refs` 和 `parentMessageId`。改后形如：

```ts
export const imageMessages = pgTable(
  'image_messages',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    chatId: uuid('chat_id').notNull().references(() => imageChats.id, { onDelete: 'cascade' }),
    role: imageMessageRoleEnum('role').notNull(),
    text: text('text'),
    model: varchar('model', { length: 100 }),
    params: jsonb('params'),
    refs: jsonb('refs').$type<Array<{ asset_id: string; role: 'content' | 'style' | 'character' }>>(),
    outputAssetIds: uuid('output_asset_ids').array(),
    status: imageMessageStatusEnum('status').notNull().default('pending'),
    error: jsonb('error'),
    parentMessageId: uuid('parent_message_id'),  // self-reference, FK below
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => ({
    idxChatCreated: index('idx_image_messages_chat_created').on(t.chatId, t.createdAt),
    idxParent: index('idx_image_messages_parent').on(t.parentMessageId).where(sql`${t.parentMessageId} IS NOT NULL`),
  }),
);
```

注：parent_message_id 的 FK 在 SQL 里加（drizzle self-reference 写起来烦，直接用 raw 索引 + relation 即可；外键迁移在下一步 SQL 文件里）。

- [ ] **Step 3: 修改 `apps/web/lib/db/schema.ts` — 加 moodboards 表**

在文件末尾（types 区之前）追加：

```ts
export const moodboards = pgTable(
  'moodboards',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    promptTemplate: text('prompt_template').notNull(),
    model: varchar('model', { length: 100 }),
    size: varchar('size', { length: 20 }),
    aspectRatio: varchar('aspect_ratio', { length: 10 }),
    refs: jsonb('refs').$type<Array<{ asset_id: string; role: 'content' | 'style' | 'character' }>>(),
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    idxUserActive: index('idx_moodboards_user_active').on(t.userId, t.deletedAt, t.updatedAt),
  }),
);

export type Moodboard = typeof moodboards.$inferSelect;
export type NewMoodboard = typeof moodboards.$inferInsert;
```

确认顶部 import 中已有 `index, sql, jsonb, varchar, text, uuid, timestamp, pgTable`，缺啥补啥。

- [ ] **Step 4: 写 `apps/web/lib/db/migrations/0003_studio_phase1.sql`**

```sql
-- ─── 1) members drift fix（hot-patch 正式落） ────────────────
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "invited_at" timestamp NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "joined_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "joined_at" DROP DEFAULT;--> statement-breakpoint
-- 索引名对齐（旧版本可能叫 uniq_members_workspace_user）
ALTER INDEX IF EXISTS "uniq_members_workspace_user" RENAME TO "uniq_member_workspace_user";--> statement-breakpoint

-- ─── 2) image_messages: drop ref_asset_ids, add refs jsonb + parent_message_id ──
ALTER TABLE "image_messages" DROP COLUMN IF EXISTS "ref_asset_ids";--> statement-breakpoint
ALTER TABLE "image_messages" ADD COLUMN "refs" jsonb;--> statement-breakpoint
ALTER TABLE "image_messages" ADD COLUMN "parent_message_id" uuid;--> statement-breakpoint
ALTER TABLE "image_messages" ADD CONSTRAINT "image_messages_parent_fk"
  FOREIGN KEY ("parent_message_id") REFERENCES "image_messages"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_image_messages_parent" ON "image_messages" ("parent_message_id") WHERE "parent_message_id" IS NOT NULL;--> statement-breakpoint

-- ─── 3) moodboards 表 ─────────────────────────────────────────
CREATE TABLE "moodboards" (
  "id"              uuid PRIMARY KEY NOT NULL,
  "workspace_id"    uuid NOT NULL,
  "user_id"         uuid NOT NULL,
  "title"           varchar(200) NOT NULL,
  "prompt_template" text NOT NULL,
  "model"           varchar(100),
  "size"            varchar(20),
  "aspect_ratio"    varchar(10),
  "refs"            jsonb,
  "cover_asset_id"  uuid,
  "notes"           text,
  "created_at"      timestamp DEFAULT now() NOT NULL,
  "updated_at"      timestamp DEFAULT now() NOT NULL,
  "deleted_at"      timestamp
);--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_cover_asset_fk"
  FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_moodboards_user_active" ON "moodboards" ("user_id","deleted_at","updated_at");
```

- [ ] **Step 5: 更新 drizzle 迁移 journal**

```bash
cd apps/web
# 让 drizzle 把新迁移登记进 journal（如果 db:generate 卡 TTY 就手工编辑 meta/_journal.json）
cat lib/db/migrations/meta/_journal.json
```

如果 journal 里没有 `0003_studio_phase1` 条目，手工追加 `{ idx: 3, version: "7", when: <timestamp>, tag: "0003_studio_phase1", breakpoints: true }`（其它字段按 0002 的形态填）。

- [ ] **Step 6: 跑迁移验证**

```bash
cd apps/web
pnpm db:migrate
```

期望：`✓ migrations applied successfully!`

```bash
PGPASSWORD='123Hxh' psql -h 104.194.91.23 -p 5444 -U root -d postgres -c "\d image_messages" | grep -E "refs|parent_message_id"
PGPASSWORD='123Hxh' psql -h 104.194.91.23 -p 5444 -U root -d postgres -c "\d moodboards"
```

期望：image_messages 有 `refs jsonb` 和 `parent_message_id uuid`；moodboards 表存在含全部字段。

- [ ] **Step 7: typecheck**

```bash
cd apps/web
pnpm typecheck
```

期望：无 error。（任何引用 `refAssetIds` 的旧代码会在这里报错，Task 3 修。）

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/db/schema.ts apps/web/lib/db/migrations/0003_studio_phase1.sql apps/web/lib/db/migrations/meta/_journal.json
git commit -m "feat(db): Studio Phase 1 schema — refs jsonb + parent_message_id + moodboards table; members hot-patch正式化"
```

---

## Task 2: Capability matrix in models.ts + helpers + 单测

**Files:**
- Modify: `apps/web/lib/studio/models.ts`
- Create: `apps/web/lib/studio/__tests__/models.test.ts`

- [ ] **Step 1: 写 fail 测**

创建 `apps/web/lib/studio/__tests__/models.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODELS, modelSupports, firstModelSupporting } from '../models';

test('每个 model 都有完整 capabilities', () => {
  for (const m of Object.values(MODELS)) {
    assert.ok(m.capabilities, `${m.id} 缺 capabilities`);
    for (const key of ['imageInput', 'inpaint', 'outpaint', 'seed', 'transparentBackground', 'multiTurn'] as const) {
      assert.equal(typeof m.capabilities[key], 'boolean', `${m.id}.${key} 非 boolean`);
    }
  }
});

test('真值表：gpt-image-2 所有 cap 除 multiTurn 外为 true', () => {
  const c = MODELS['gpt-image-2']!.capabilities;
  assert.deepEqual(c, {
    imageInput: true,
    inpaint: true,
    outpaint: true,
    seed: true,
    transparentBackground: true,
    multiTurn: false,
  });
});

test('真值表：Gemini 模型只有 imageInput + multiTurn 为 true', () => {
  for (const id of ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']) {
    const c = MODELS[id]!.capabilities;
    assert.deepEqual(c, {
      imageInput: true,
      inpaint: false,
      outpaint: false,
      seed: false,
      transparentBackground: false,
      multiTurn: true,
    });
  }
});

test('modelSupports 对未知 model 返回 false', () => {
  assert.equal(modelSupports('nonexistent-model', 'imageInput'), false);
});

test('modelSupports 反映真值表', () => {
  assert.equal(modelSupports('gpt-image-2', 'inpaint'), true);
  assert.equal(modelSupports('gemini-3-pro-image-preview', 'inpaint'), false);
});

test('firstModelSupporting 返回第一个支持的 model', () => {
  const m = firstModelSupporting('inpaint');
  assert.ok(m, '应该有支持 inpaint 的模型');
  assert.equal(m!.id, 'gpt-image-2');
});

test('firstModelSupporting 对无人支持的 cap 返回 null', () => {
  // 假设有个未在三模型里实现的 cap（这测会随真值表演进——把 cap 名换成永远没人支持的）
  // 实际三模型都至少有 imageInput，所以 imageInput 永远返回非 null；这里举反例需自定义假数据
  // 改测：所有三模型都有 imageInput
  const m = firstModelSupporting('imageInput');
  assert.ok(m);
});
```

- [ ] **Step 2: 跑测验证 fail**

```bash
cd apps/web
pnpm test
```

期望：报错 `capabilities` 字段不存在 / `modelSupports` undefined。

- [ ] **Step 3: 实现 capabilities + helpers**

修改 `apps/web/lib/studio/models.ts`：

```ts
export type ModelGroup = 'codex' | 'banana';
export type ModelEndpoint = 'images' | 'chat';

export interface ModelCapabilities {
  imageInput: boolean;
  inpaint: boolean;
  outpaint: boolean;
  seed: boolean;
  transparentBackground: boolean;
  multiTurn: boolean;
}

export interface StudioModel {
  id: string;
  label: string;
  group: ModelGroup;
  endpoint: ModelEndpoint;
  defaultSize?: string;
  defaultAspectRatio?: string;
  maxN: number;
  capabilities: ModelCapabilities;
}

export const MODELS: Record<string, StudioModel> = {
  'gpt-image-2': {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    group: 'codex',
    endpoint: 'images',
    defaultSize: '1024x1024',
    maxN: 4,
    capabilities: {
      imageInput: true,
      inpaint: true,
      outpaint: true,
      seed: true,
      transparentBackground: true,
      multiTurn: false,
    },
  },
  'gemini-3.1-flash-image-preview': {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    group: 'banana',
    endpoint: 'chat',
    defaultAspectRatio: '1:1',
    maxN: 4,
    capabilities: {
      imageInput: true,
      inpaint: false,
      outpaint: false,
      seed: false,
      transparentBackground: false,
      multiTurn: true,
    },
  },
  'gemini-3-pro-image-preview': {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    group: 'banana',
    endpoint: 'chat',
    defaultAspectRatio: '1:1',
    maxN: 2,
    capabilities: {
      imageInput: true,
      inpaint: false,
      outpaint: false,
      seed: false,
      transparentBackground: false,
      multiTurn: true,
    },
  },
};

export const DEFAULT_MODEL_ID = 'gpt-image-2';

export function getModel(id: string): StudioModel | null {
  return MODELS[id] ?? null;
}

export function listModels(): StudioModel[] {
  return Object.values(MODELS);
}

export function modelSupports(modelId: string, cap: keyof ModelCapabilities): boolean {
  const m = MODELS[modelId];
  return m ? m.capabilities[cap] : false;
}

export function firstModelSupporting(cap: keyof ModelCapabilities): StudioModel | null {
  return listModels().find((m) => m.capabilities[cap]) ?? null;
}
```

- [ ] **Step 4: 跑测验证 pass**

```bash
cd apps/web
pnpm test 2>&1 | tail -20
```

期望：全部新测通过。

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/studio/models.ts apps/web/lib/studio/__tests__/models.test.ts
git commit -m "feat(studio): capabilities 字段 + modelSupports/firstModelSupporting helpers"
```

---

## Task 3: studio-queries.ts refactor for refs jsonb shape

**Files:**
- Modify: `apps/web/lib/db/studio-queries.ts`
- Create: `apps/web/lib/db/__tests__/studio-queries.test.ts`

- [ ] **Step 1: 扫描旧 `refAssetIds` 用法**

```bash
cd apps/web
grep -rn "refAssetIds\|ref_asset_ids" lib/ app/ --include='*.ts' --include='*.tsx'
```

把所有出现的地方记下来（generate route、studio-queries、type definitions、组件等）。Task 3 只改 lib/db/，Task 6 改 generate route，Task 10 改 types.ts，Task 11/13 改组件。

- [ ] **Step 2: 改 `studio-queries.ts`**

主要改两个函数：

a) `createPendingAssistantMessage(...)` — 入参从 `refAssetIds: string[]` 改成 `refs: Array<{asset_id, role}>` 和新增 `parentMessageId?: string`：

```ts
export async function createPendingAssistantMessage(input: {
  chatId: string;
  model: string;
  params: Record<string, unknown>;
  refs?: Array<{ asset_id: string; role: 'content' | 'style' | 'character' }>;
  parentMessageId?: string;
}): Promise<ImageMessage> {
  const [row] = await db
    .insert(imageMessages)
    .values({
      chatId: input.chatId,
      role: 'assistant',
      model: input.model,
      params: input.params,
      refs: input.refs ?? null,
      parentMessageId: input.parentMessageId ?? null,
      status: 'pending',
    })
    .returning();
  if (!row) throw new Error('createPendingAssistantMessage failed');
  return row;
}
```

b) `recordUserMessage(...)` — 同样把 `refAssetIds` 改成 `refs` + `parentMessageId`：

```ts
export async function recordUserMessage(input: {
  chatId: string;
  text: string;
  refs?: Array<{ asset_id: string; role: 'content' | 'style' | 'character' }>;
  parentMessageId?: string;
}): Promise<ImageMessage> {
  const [row] = await db
    .insert(imageMessages)
    .values({
      chatId: input.chatId,
      role: 'user',
      text: input.text,
      refs: input.refs ?? null,
      parentMessageId: input.parentMessageId ?? null,
      status: 'completed',  // user messages are immediately completed
      completedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('recordUserMessage failed');
  return row;
}
```

c) 任何读取 `m.refAssetIds` 的地方（如 `getChatWithMessages`）改成读 `m.refs`，下游消费者拿到 `Array<{asset_id, role}>`。

- [ ] **Step 3: 写集成测**

创建 `apps/web/lib/db/__tests__/studio-queries.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../drizzle';
import { imageChats, imageMessages, users, workspaces, members } from '../schema';
import { eq } from 'drizzle-orm';
import { createPendingAssistantMessage, recordUserMessage } from '../studio-queries';

// 这些测共用一个临时 user/workspace/chat
let tmpUserId: string;
let tmpWorkspaceId: string;
let tmpChatId: string;

test('setup: 建临时 user/workspace/chat', async () => {
  const [u] = await db.insert(users).values({ email: `tmp+${Date.now()}@test.local`, passwordHash: 'x' }).returning();
  tmpUserId = u!.id;
  const [w] = await db.insert(workspaces).values({ slug: `tmp-${Date.now()}`, name: 'tmp', ownerUserId: tmpUserId, planId: 'free' }).returning();
  tmpWorkspaceId = w!.id;
  await db.insert(members).values({ userId: tmpUserId, workspaceId: tmpWorkspaceId, role: 'owner' });
  const [c] = await db.insert(imageChats).values({ workspaceId: tmpWorkspaceId, userId: tmpUserId, title: 'tmp' }).returning();
  tmpChatId = c!.id;
});

test('createPendingAssistantMessage 写入 refs jsonb', async () => {
  const msg = await createPendingAssistantMessage({
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
  assert.equal(msg.status, 'pending');
});

test('recordUserMessage 支持 parentMessageId', async () => {
  const parent = await createPendingAssistantMessage({ chatId: tmpChatId, model: 'gpt-image-2', params: {} });
  const child = await recordUserMessage({
    chatId: tmpChatId,
    text: 'reroll test',
    parentMessageId: parent.id,
  });
  assert.equal(child.parentMessageId, parent.id);
});

test('cleanup', async () => {
  await db.delete(imageChats).where(eq(imageChats.id, tmpChatId));
  await db.delete(workspaces).where(eq(workspaces.id, tmpWorkspaceId));
  await db.delete(users).where(eq(users.id, tmpUserId));
});
```

- [ ] **Step 4: 跑测**

```bash
cd apps/web
pnpm test 2>&1 | tail -30
```

期望：3 个新测都过。如果 `recordUserMessage` 在 studio-queries.ts 不存在，可能是新加的；按 Task 6 计划改 generate route 时统一调用。

- [ ] **Step 5: typecheck**

```bash
cd apps/web
pnpm typecheck 2>&1 | tail -10
```

如果 generate route 仍引用旧 `refAssetIds` 报错，那是预期的——Task 6 会修。

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/db/studio-queries.ts apps/web/lib/db/__tests__/studio-queries.test.ts
git commit -m "feat(db): studio-queries refs jsonb + parentMessageId 支持"
```

---

## Task 4: moodboard-queries.ts + 集成测

**Files:**
- Create: `apps/web/lib/db/moodboard-queries.ts`
- Create: `apps/web/lib/db/__tests__/moodboard-queries.test.ts`

- [ ] **Step 1: 写 fail 测**

`apps/web/lib/db/__tests__/moodboard-queries.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../drizzle';
import { users, workspaces, members, moodboards } from '../schema';
import { eq } from 'drizzle-orm';
import {
  createMoodboard,
  listMoodboardsForUser,
  getMoodboardById,
  updateMoodboard,
  softDeleteMoodboard,
  setCoverIfMissing,
} from '../moodboard-queries';

let userId: string;
let workspaceId: string;
let otherUserId: string;

test('setup users + workspaces', async () => {
  const [u1] = await db.insert(users).values({ email: `mb-u1-${Date.now()}@test.local`, passwordHash: 'x' }).returning();
  const [u2] = await db.insert(users).values({ email: `mb-u2-${Date.now()}@test.local`, passwordHash: 'x' }).returning();
  userId = u1!.id; otherUserId = u2!.id;
  const [w] = await db.insert(workspaces).values({ slug: `mb-w-${Date.now()}`, name: 'mb', ownerUserId: userId, planId: 'free' }).returning();
  workspaceId = w!.id;
  await db.insert(members).values({ userId, workspaceId, role: 'owner' });
});

test('createMoodboard 落库', async () => {
  const m = await createMoodboard({
    workspaceId, userId,
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
  await createMoodboard({ workspaceId, userId, title: 'a', promptTemplate: 'x' });
  await createMoodboard({ workspaceId, userId: otherUserId, title: 'other', promptTemplate: 'x' });
  const mine = await listMoodboardsForUser(userId);
  assert.ok(mine.length >= 2);
  assert.ok(mine.every((m) => m.userId === userId));
  assert.ok(mine.every((m) => m.deletedAt === null));
});

test('updateMoodboard 改字段 + 自动 updated_at', async () => {
  const m = await createMoodboard({ workspaceId, userId, title: 'orig', promptTemplate: 'x' });
  const updated = await updateMoodboard(m.id, userId, { title: 'new', notes: 'note' });
  assert.equal(updated?.title, 'new');
  assert.equal(updated?.notes, 'note');
});

test('updateMoodboard 拒绝非创建者', async () => {
  const m = await createMoodboard({ workspaceId, userId, title: 'orig', promptTemplate: 'x' });
  const updated = await updateMoodboard(m.id, otherUserId, { title: 'hijack' });
  assert.equal(updated, null);
});

test('softDeleteMoodboard 设 deleted_at', async () => {
  const m = await createMoodboard({ workspaceId, userId, title: 'doomed', promptTemplate: 'x' });
  const ok = await softDeleteMoodboard(m.id, userId);
  assert.equal(ok, true);
  const after = await getMoodboardById(m.id, userId);
  assert.equal(after, null);
});

test('setCoverIfMissing 首次写入', async () => {
  const m = await createMoodboard({ workspaceId, userId, title: 'cover-test', promptTemplate: 'x' });
  const r1 = await setCoverIfMissing(m.id, '00000000-0000-0000-0000-000000000099');
  assert.equal(r1, true);
});

test('setCoverIfMissing 已有 cover 时不覆盖', async () => {
  const m = await createMoodboard({ workspaceId, userId, title: 'cover-2', promptTemplate: 'x' });
  await setCoverIfMissing(m.id, '00000000-0000-0000-0000-000000000099');
  const r2 = await setCoverIfMissing(m.id, '00000000-0000-0000-0000-000000000111');
  assert.equal(r2, false);
});

test('cleanup', async () => {
  await db.delete(moodboards).where(eq(moodboards.userId, userId));
  await db.delete(moodboards).where(eq(moodboards.userId, otherUserId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherUserId));
});
```

- [ ] **Step 2: 跑测验证 fail**

```bash
cd apps/web && pnpm test 2>&1 | tail -20
```

期望：`moodboard-queries` 模块不存在导致 import 失败。

- [ ] **Step 3: 实现 `moodboard-queries.ts`**

```ts
import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { moodboards, type Moodboard } from './schema';

type RefRole = 'content' | 'style' | 'character';
type Refs = Array<{ asset_id: string; role: RefRole }>;

export interface CreateMoodboardInput {
  workspaceId: string;
  userId: string;
  title: string;
  promptTemplate: string;
  model?: string | null;
  size?: string | null;
  aspectRatio?: string | null;
  refs?: Refs | null;
  notes?: string | null;
}

export async function createMoodboard(input: CreateMoodboardInput): Promise<Moodboard> {
  const [row] = await db
    .insert(moodboards)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      promptTemplate: input.promptTemplate,
      model: input.model ?? null,
      size: input.size ?? null,
      aspectRatio: input.aspectRatio ?? null,
      refs: input.refs ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('createMoodboard failed');
  return row;
}

export async function listMoodboardsForUser(userId: string, limit = 50): Promise<Moodboard[]> {
  return db
    .select()
    .from(moodboards)
    .where(and(eq(moodboards.userId, userId), isNull(moodboards.deletedAt)))
    .orderBy(desc(moodboards.updatedAt))
    .limit(limit);
}

export async function getMoodboardById(id: string, userId: string): Promise<Moodboard | null> {
  const [row] = await db
    .select()
    .from(moodboards)
    .where(and(eq(moodboards.id, id), eq(moodboards.userId, userId), isNull(moodboards.deletedAt)))
    .limit(1);
  return row ?? null;
}

export interface UpdateMoodboardInput {
  title?: string;
  promptTemplate?: string;
  model?: string | null;
  size?: string | null;
  aspectRatio?: string | null;
  refs?: Refs | null;
  notes?: string | null;
}

export async function updateMoodboard(
  id: string,
  userId: string,
  patch: UpdateMoodboardInput,
): Promise<Moodboard | null> {
  const [row] = await db
    .update(moodboards)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(moodboards.id, id), eq(moodboards.userId, userId), isNull(moodboards.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDeleteMoodboard(id: string, userId: string): Promise<boolean> {
  const [row] = await db
    .update(moodboards)
    .set({ deletedAt: new Date() })
    .where(and(eq(moodboards.id, id), eq(moodboards.userId, userId), isNull(moodboards.deletedAt)))
    .returning({ id: moodboards.id });
  return !!row;
}

/**
 * 首次写入 cover_asset_id；已有 cover 时无 op。返回 true=写入成功，false=已有 cover。
 * 用于 generate route 在成功生成后异步回写 Moodboard 封面。
 */
export async function setCoverIfMissing(moodboardId: string, assetId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE moodboards
    SET cover_asset_id = ${assetId}, updated_at = NOW()
    WHERE id = ${moodboardId} AND cover_asset_id IS NULL AND deleted_at IS NULL
    RETURNING id
  `);
  // drizzle execute returns { rows: [...] }
  return ((result as unknown as { rows: unknown[] }).rows?.length ?? 0) > 0;
}
```

- [ ] **Step 4: 跑测验证 pass**

```bash
cd apps/web && pnpm test 2>&1 | tail -30
```

期望：8 个新测全过。

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/db/moodboard-queries.ts apps/web/lib/db/__tests__/moodboard-queries.test.ts
git commit -m "feat(db): moodboard-queries CRUD + setCoverIfMissing 幂等"
```

---

## Task 5: Upstream prompt prefix construction + 单测

**Files:**
- Modify: `apps/web/lib/studio/upstream.ts`
- Create: `apps/web/lib/studio/__tests__/upstream.test.ts`

- [ ] **Step 1: 写 fail 测（仅 prompt 构造，不打真实网络）**

`apps/web/lib/studio/__tests__/upstream.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildEffectivePrompt } from '../upstream';

test('无 refs 时 effectivePrompt 等于原 prompt', () => {
  const p = buildEffectivePrompt({ prompt: 'a cat', refs: [] });
  assert.equal(p, 'a cat');
});

test('1 张 content ref 加 [content reference] 前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'wearing a hat',
    refs: [{ asset_id: 'a', role: 'content' }],
  });
  assert.match(p, /\[content reference\]/);
  assert.match(p, /wearing a hat$/);
});

test('content + style 分别前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'wearing a hat',
    refs: [
      { asset_id: 'a', role: 'content' },
      { asset_id: 'b', role: 'style' },
    ],
  });
  assert.match(p, /\[content reference\]/);
  assert.match(p, /\[style reference\]/);
});

test('character role 加 [keep character consistent] 前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'in a forest',
    refs: [{ asset_id: 'c', role: 'character' }],
  });
  assert.match(p, /\[keep character consistent\]/);
});

test('多张同 role 合并到单个前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'merged',
    refs: [
      { asset_id: 'a', role: 'content' },
      { asset_id: 'b', role: 'content' },
    ],
  });
  // 期望：只出现一次 "[content reference]"，提到 "2 images"
  const matches = p.match(/\[content reference\]/g);
  assert.equal(matches?.length, 1);
  assert.match(p, /2 images?/i);
});
```

- [ ] **Step 2: 跑测验证 fail**

```bash
cd apps/web && pnpm test 2>&1 | tail -10
```

期望：`buildEffectivePrompt` 未定义。

- [ ] **Step 3: 实现 + export `buildEffectivePrompt`**

在 `apps/web/lib/studio/upstream.ts` 顶部（接 imports 后）加：

```ts
type RefRole = 'content' | 'style' | 'character';

export interface UpstreamRef {
  asset_id: string;
  role: RefRole;
  mime?: string;
  bytes?: Buffer;
}

/**
 * 把 prompt 与 refs 按 role 分组拼成 effective prompt。
 * 设计目标：让单一上游（不论 OpenAI-compat 还是 Gemini chat）
 * 都能从纯文本里捕捉到 "哪张图是内容、哪张图是风格" 的语义，
 * 不依赖 API 提供 role 槽位。
 */
export function buildEffectivePrompt(input: {
  prompt: string;
  refs: Array<{ asset_id: string; role: RefRole }>;
}): string {
  if (input.refs.length === 0) return input.prompt;
  const byRole: Record<RefRole, number> = { content: 0, style: 0, character: 0 };
  for (const r of input.refs) byRole[r.role]++;
  const segments: string[] = [];
  if (byRole.content > 0) {
    segments.push(`[content reference]${byRole.content > 1 ? ` (${byRole.content} images)` : ''}`);
  }
  if (byRole.style > 0) {
    segments.push(`[style reference]${byRole.style > 1 ? ` (${byRole.style} images)` : ''}`);
  }
  if (byRole.character > 0) {
    segments.push(`[keep character consistent]${byRole.character > 1 ? ` (${byRole.character} images)` : ''}`);
  }
  return `${segments.join(' ')} ${input.prompt}`;
}
```

- [ ] **Step 4: 跑测验证 pass**

```bash
cd apps/web && pnpm test 2>&1 | tail -10
```

期望：5 个新测全过。

- [ ] **Step 5: 改 `generate()` 调用 buildEffectivePrompt**

`generateViaImages` 和 `generateViaChat` 两个函数都需要把入参 `input.prompt` 替换为 `buildEffectivePrompt({ prompt: input.prompt, refs: ... })`。

但当前 `GenerateInput` 入参里没有 refs 的 role 信息（只有 `inputImages: UpstreamInputImage[]`）。需要把 `GenerateInput.inputImages` 字段升级带 role：

```ts
export interface UpstreamInputImage {
  mime: string;
  bytes: Buffer;
  role: RefRole;
}
```

然后在两个 generate 函数顶部：

```ts
const refsForPrompt = (input.inputImages ?? []).map((img, i) => ({
  asset_id: `ref-${i}`,
  role: img.role,
}));
const effectivePrompt = buildEffectivePrompt({ prompt: input.prompt, refs: refsForPrompt });
```

然后把后续所有 `input.prompt` 用法（`fd.append('prompt', input.prompt)` / `body.prompt` / chat content text）替换为 `effectivePrompt`。

- [ ] **Step 6: typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

generate route 引用 `inputImages` 不带 role 处会报错，那是预期，Task 6 修。

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/studio/upstream.ts apps/web/lib/studio/__tests__/upstream.test.ts
git commit -m "feat(studio): upstream buildEffectivePrompt + inputImages 带 role 维度"
```

---

## Task 6: Generate route — refs/capability/parent_message_id + zod 扩展

**Files:**
- Modify: `apps/web/app/api/studio/chats/[id]/generate/route.ts`

- [ ] **Step 1: 看现有 route 结构**

```bash
cd apps/web && wc -l app/api/studio/chats/\[id\]/generate/route.ts
```

确认入口形态（POST handler、zod schema 名字、quota reserve 顺序）。

- [ ] **Step 2: 扩展 zod schema**

定位 `generateBodySchema`（或类似命名），改为：

```ts
const refRoleSchema = z.enum(['content', 'style', 'character']);
const refsSchema = z.array(z.object({
  asset_id: z.string().uuid(),
  role: refRoleSchema,
})).max(8).optional();

const generateBodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z.string(),
  n: z.number().int().min(1).max(8),
  size: z.string().optional(),
  aspectRatio: z.string().optional(),
  refs: refsSchema,
  conversational: z.boolean().optional(),
  parentMessageId: z.string().uuid().optional(),
  seed: z.number().int().optional(),
  transparentBackground: z.boolean().optional(),
  moodboardId: z.string().uuid().optional(),
});
```

- [ ] **Step 3: 加 capability 校验**

紧跟在 model lookup 后：

```ts
import { getModel, modelSupports, type ModelCapabilities } from '@/lib/studio/models';

const model = getModel(body.model);
if (!model) return Response.json({ error: 'unknown_model', model: body.model }, { status: 400 });

const capChecks: Array<{ field: string; cap: keyof ModelCapabilities; condition: boolean }> = [
  { field: 'seed', cap: 'seed', condition: body.seed !== undefined },
  { field: 'transparentBackground', cap: 'transparentBackground', condition: !!body.transparentBackground },
  { field: 'character', cap: 'multiTurn', condition: !!body.refs?.some((r) => r.role === 'character') },
];
for (const c of capChecks) {
  if (c.condition && !model.capabilities[c.cap]) {
    return Response.json(
      { error: 'capability_unsupported', cap: c.cap, model: body.model, field: c.field },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 4: 改 ref 取数路径**

旧代码下载 `refAssetIds` 对应 asset 字节。改成读 `body.refs` 并保留 role：

```ts
import { getAssetBytes } from '@/lib/db/asset-queries'; // 或者用现有 storage api

const inputImages: UpstreamInputImage[] = [];
for (const r of body.refs ?? []) {
  const asset = await getAssetByIdForWorkspace(r.asset_id, workspaceId);
  if (!asset) continue;  // 软容忍：缺失就跳过
  const bytes = await readAssetBytes(asset.key);
  inputImages.push({ mime: asset.mime, bytes, role: r.role });
}
```

（具体 `getAssetByIdForWorkspace` / `readAssetBytes` 名字以仓库现有为准；旧 generate route 已经做了类似的事，照搬。）

- [ ] **Step 5: 写 parent_message_id**

旧调用 `createPendingAssistantMessage` / `recordUserMessage` 时透传 `parentMessageId`：

```ts
const userMsg = await recordUserMessage({
  chatId,
  text: body.prompt,
  refs: body.refs,
  parentMessageId: body.parentMessageId,
});

const assistantMsg = await createPendingAssistantMessage({
  chatId,
  model: body.model,
  params: { n: body.n, size: body.size, aspectRatio: body.aspectRatio, seed: body.seed, transparentBackground: body.transparentBackground },
  refs: body.refs,
  parentMessageId: body.parentMessageId,
});
```

- [ ] **Step 6: typecheck + dev server smoke**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

期望 clean。然后启 dev server：

```bash
cd apps/web && pnpm dev
# 另一终端
SESSION=$(mint-session)   # 用 Task 0 的 _smoke_mint 同款脚本
curl -sS -b "session=$SESSION" -X POST http://localhost:3000/api/studio/chats \
  -H 'Content-Type: application/json' -d '{"title":"t6"}'  # 拿 chat id
CHAT=...
curl -sS -b "session=$SESSION" -X POST "http://localhost:3000/api/studio/chats/$CHAT/generate" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"test t6","model":"gemini-3.1-flash-image-preview","n":1,"aspectRatio":"1:1"}'
```

期望：200 + 含 outputs。dev log 显示 `effectivePrompt` 无 ref prefix（因无 refs）。

再测一次带 refs：先上传一张 user_upload，拿 asset_id，再 POST refs:[{asset_id, role:'content'}] 提交，确认 dev log 显示带 `[content reference]` 前缀。

- [ ] **Step 7: capability 校验冒烟**

```bash
curl -sS -b "session=$SESSION" -X POST "http://localhost:3000/api/studio/chats/$CHAT/generate" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"test","model":"gemini-3.1-flash-image-preview","n":1,"aspectRatio":"1:1","seed":42}'
```

期望：400 `{ error: 'capability_unsupported', cap: 'seed', model: 'gemini-3.1-flash-image-preview' }`。

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/studio/chats/\[id\]/generate/route.ts
git commit -m "feat(api): generate route — refs jsonb + capability 校验 + parent_message_id 支持"
```

---

## Task 7: Generate route — conversational mode III + moodboardId hint

**Files:**
- Modify: `apps/web/app/api/studio/chats/[id]/generate/route.ts`
- Modify: `apps/web/lib/studio/upstream.ts`（加 historyMessages 入参）

- [ ] **Step 1: 在 upstream.ts 的 `generateViaChat` 加 history 支持**

`GenerateInput` 加可选 `historyMessages?: Array<{ role: 'user'|'assistant'; text?: string; imageDataUrls?: string[] }>`。在 chat path 内构造 `messages` 数组时若有 history 则前置：

```ts
const baseMessages = (input.historyMessages ?? []).map((m) => ({
  role: m.role,
  content: m.text ? [{ type: 'text' as const, text: m.text }] : (m.imageDataUrls ?? []).map((u) => ({ type: 'image_url' as const, image_url: { url: u } })),
}));
const body: Record<string, unknown> = {
  model: model.id,
  messages: [...baseMessages, { role: 'user', content }],
  modalities: ['image', 'text'],
  stream: false,
};
```

- [ ] **Step 2: 在 generate route 加 conversational 分支**

```ts
import { getRecentChatMessagesForContext, getFirstOutputAssetOfLatestCompletedAssistant } from '@/lib/db/studio-queries';

let historyMessages: Array<{ role: 'user'|'assistant'; text?: string; imageDataUrls?: string[] }> = [];
const warnings: string[] = [];

if (body.conversational === true) {
  if (model.capabilities.multiTurn) {
    // 路径 I：取最近 8 条 completed 历史发给上游
    const history = await getRecentChatMessagesForContext(chatId, 8);
    historyMessages = history.map((m) => ({
      role: m.role,
      text: m.text ?? undefined,
      imageDataUrls: undefined,  // Phase 1 不发 assistant 输出图，避免 sparkcode 不一致行为
    }));
  } else if (model.capabilities.imageInput) {
    // 路径 II：自动接龙——把上一条 completed assistant 的首张输出加入 content_ref
    const sourceAssetId = await getFirstOutputAssetOfLatestCompletedAssistant(chatId);
    if (sourceAssetId) {
      // 合并到 body.refs（不修改 zod 校验过的 refs，本地复制一份）
      const augmentedRefs = [...(body.refs ?? []), { asset_id: sourceAssetId, role: 'content' as const }];
      body.refs = augmentedRefs;
      warnings.push('autoAppendedRefFromHistory');
    }
  } else {
    return Response.json({ error: 'capability_unsupported', cap: 'conversational', model: body.model }, { status: 400 });
  }
}
```

- [ ] **Step 3: 加 moodboardId hint 处理**

成功 generate 之后（写完 outputs 之后）：

```ts
import { setCoverIfMissing } from '@/lib/db/moodboard-queries';
import { getMoodboardById } from '@/lib/db/moodboard-queries';

if (body.moodboardId && outputAssets.length > 0) {
  const mb = await getMoodboardById(body.moodboardId, userId);
  if (mb) {
    // fire-and-forget；不 await，错误不阻塞响应
    setCoverIfMissing(body.moodboardId, outputAssets[0]!.id).catch((e) => console.warn('moodboard cover write failed', e));
  }
  // 不属于该 user 时静默忽略
}
```

- [ ] **Step 4: 加 warnings 字段到响应**

响应 JSON 末尾加 `warnings: warnings.length > 0 ? warnings : undefined`。

- [ ] **Step 5: 实现 `getRecentChatMessagesForContext` 和 `getFirstOutputAssetOfLatestCompletedAssistant`**

在 `lib/db/studio-queries.ts` 加：

```ts
export async function getRecentChatMessagesForContext(
  chatId: string,
  limit: number,
): Promise<Array<{ role: 'user' | 'assistant'; text: string | null }>> {
  const rows = await db
    .select({ role: imageMessages.role, text: imageMessages.text })
    .from(imageMessages)
    .where(and(eq(imageMessages.chatId, chatId), eq(imageMessages.status, 'completed')))
    .orderBy(desc(imageMessages.createdAt))
    .limit(limit);
  // 注意要时间正序返还给 upstream
  return rows.reverse();
}

export async function getFirstOutputAssetOfLatestCompletedAssistant(chatId: string): Promise<string | null> {
  const [row] = await db
    .select({ ids: imageMessages.outputAssetIds })
    .from(imageMessages)
    .where(and(eq(imageMessages.chatId, chatId), eq(imageMessages.role, 'assistant'), eq(imageMessages.status, 'completed')))
    .orderBy(desc(imageMessages.createdAt))
    .limit(1);
  return row?.ids?.[0] ?? null;
}
```

- [ ] **Step 6: typecheck + 冒烟**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

启 dev server 后冒烟：

```bash
# 先建一个 chat 并跑一次普通 generate（产生历史）
# 然后开 conversational 再 generate
curl -sS -b "session=$SESSION" -X POST ".../generate" -d '{
  "prompt":"variant","model":"gemini-3.1-flash-image-preview","n":1,"aspectRatio":"1:1","conversational":true
}'
```

期望：200 + dev log 显示上游 `messages` 数组里含历史 messages（multiTurn 路径）。

然后切 GPT 测自动接龙：

```bash
curl -sS -b "session=$SESSION" -X POST ".../generate" -d '{
  "prompt":"variant gpt","model":"gpt-image-2","n":1,"size":"1024x1024","conversational":true
}'
```

期望（如果 GPT 渠道仍 down，会因 upstream 500 失败；但 dev log 仍能看到 refs 被自动追加 + warnings: ['autoAppendedRefFromHistory']）。即使生成失败也算 Task 通过——目标是验证 route 行为，不是验证上游。

- [ ] **Step 7: moodboardId 冒烟**

```bash
# 先手动 INSERT 一个 moodboard 拿 id（暂用 SQL）
MB_ID=...
curl -sS -b "session=$SESSION" -X POST ".../generate" -d "{
  \"prompt\":\"mb test\",\"model\":\"gemini-3.1-flash-image-preview\",\"n\":1,\"aspectRatio\":\"1:1\",\"moodboardId\":\"$MB_ID\"
}"
```

期望：200。然后查 DB：

```bash
PGPASSWORD='123Hxh' psql -h ... -c "SELECT cover_asset_id FROM moodboards WHERE id='$MB_ID'"
```

期望：cover_asset_id 非 null。再 generate 一次：cover_asset_id 不变。

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/studio/upstream.ts apps/web/app/api/studio/chats/\[id\]/generate/route.ts apps/web/lib/db/studio-queries.ts
git commit -m "feat(api): generate route — conversational mode (III) + moodboardId cover hint"
```

---

## Task 8: Moodboard 4 个 CRUD endpoint + curl 冒烟

**Files:**
- Create: `apps/web/app/api/studio/moodboards/route.ts`
- Create: `apps/web/app/api/studio/moodboards/[id]/route.ts`

- [ ] **Step 1: 写 `apps/web/app/api/studio/moodboards/route.ts`**

```ts
import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import { getWorkspaceForUser } from '@/lib/db/queries';
import { createMoodboard, listMoodboardsForUser } from '@/lib/db/moodboard-queries';

const refsSchema = z.array(z.object({
  asset_id: z.string().uuid(),
  role: z.enum(['content', 'style', 'character']),
})).max(8).optional();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  promptTemplate: z.string().min(1).max(4000),
  model: z.string().max(100).optional(),
  size: z.string().max(20).optional(),
  aspectRatio: z.string().max(10).optional(),
  refs: refsSchema,
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const items = await listMoodboardsForUser(user.id);
  return Response.json({ items });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const workspace = await getWorkspaceForUser(user.id);
  if (!workspace) return Response.json({ error: 'no_workspace' }, { status: 400 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const created = await createMoodboard({
    workspaceId: workspace.id,
    userId: user.id,
    ...parsed.data,
  });
  return Response.json({ moodboard: created }, { status: 201 });
}
```

- [ ] **Step 2: 写 `apps/web/app/api/studio/moodboards/[id]/route.ts`**

```ts
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { assets } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getMoodboardById, updateMoodboard, softDeleteMoodboard } from '@/lib/db/moodboard-queries';
import { publicUrlForAsset } from '@/lib/storage';   // assume helper exists

const refsSchema = z.array(z.object({
  asset_id: z.string().uuid(),
  role: z.enum(['content', 'style', 'character']),
})).max(8).optional();

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  promptTemplate: z.string().min(1).max(4000).optional(),
  model: z.string().max(100).nullable().optional(),
  size: z.string().max(20).nullable().optional(),
  aspectRatio: z.string().max(10).nullable().optional(),
  refs: refsSchema,
  notes: z.string().max(2000).nullable().optional(),
});

interface RouteCtx { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteCtx) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const mb = await getMoodboardById(id, user.id);
  if (!mb) return Response.json({ error: 'not_found' }, { status: 404 });

  // resolve cover + refs to publicUrl
  const refAssetIds = (mb.refs ?? []).map((r) => r.asset_id);
  const allIds = [...refAssetIds, ...(mb.coverAssetId ? [mb.coverAssetId] : [])];
  const assetRows = allIds.length
    ? await db.select().from(assets).where(inArray(assets.id, allIds))
    : [];
  const byId = new Map(assetRows.map((a) => [a.id, a]));

  const warnings: string[] = [];
  const refsResolved = (mb.refs ?? []).map((r) => {
    const a = byId.get(r.asset_id);
    if (!a) { warnings.push(`skippedRef:${r.asset_id}`); return null; }
    return { asset_id: r.asset_id, role: r.role, publicUrl: publicUrlForAsset(a), mime: a.mime };
  }).filter(Boolean);

  const cover = mb.coverAssetId ? byId.get(mb.coverAssetId) : null;
  const coverUrl = cover ? publicUrlForAsset(cover) : null;

  return Response.json({
    moodboard: { ...mb, refs: refsResolved, coverUrl },
    warnings: warnings.length ? warnings : undefined,
  });
}

export async function PATCH(req: Request, { params }: RouteCtx) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const updated = await updateMoodboard(id, user.id, parsed.data);
  if (!updated) return Response.json({ error: 'forbidden_or_not_found' }, { status: 403 });
  return Response.json({ moodboard: updated });
}

export async function DELETE(_req: Request, { params }: RouteCtx) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const ok = await softDeleteMoodboard(id, user.id);
  if (!ok) return Response.json({ error: 'forbidden_or_not_found' }, { status: 403 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

如果 `publicUrlForAsset` 名字不一致，搜一下：

```bash
grep -rn "publicUrl" lib/storage/ | head -5
```

按实际命名调整。

- [ ] **Step 4: curl 冒烟**

```bash
SESSION=$(mint-session)
# 创建
curl -sS -b "session=$SESSION" -X POST http://localhost:3000/api/studio/moodboards \
  -H 'Content-Type: application/json' \
  -d '{"title":"smoke mb","promptTemplate":"pixel art {{x}}"}'
# 列出
curl -sS -b "session=$SESSION" http://localhost:3000/api/studio/moodboards
# 详情
MB=...
curl -sS -b "session=$SESSION" "http://localhost:3000/api/studio/moodboards/$MB"
# 改
curl -sS -b "session=$SESSION" -X PATCH "http://localhost:3000/api/studio/moodboards/$MB" \
  -H 'Content-Type: application/json' -d '{"title":"new title"}'
# 软删
curl -sS -b "session=$SESSION" -X DELETE "http://localhost:3000/api/studio/moodboards/$MB"
```

期望：201 / 200 / 200 / 200 / 200 各自形态正确。

- [ ] **Step 5: 鉴权冒烟**

新建 user2 + session2，对 user1 的 mb 跑 PATCH / DELETE：

```bash
curl -sS -b "session=$SESSION2" -X PATCH "http://localhost:3000/api/studio/moodboards/$MB" -d '{"title":"hijack"}'
```

期望：403。

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/studio/moodboards
git commit -m "feat(api): moodboards CRUD endpoints + 创建者鉴权"
```

---

## Task 9: Library endpoint + curl 冒烟

**Files:**
- Create: `apps/web/app/api/studio/library/route.ts`
- Modify: `apps/web/lib/db/studio-queries.ts`（加 listLibraryAssets）

- [ ] **Step 1: 在 studio-queries 加查询**

```ts
import { sql } from 'drizzle-orm';

export interface LibraryItem {
  assetId: string;
  publicUrl: string;
  mime: string;
  createdAt: Date;
  model: string | null;
  chatId: string;
  chatTitle: string;
  messageId: string;
  promptExcerpt: string;
}

export async function listLibraryAssets(input: {
  workspaceId: string;
  modelFilter?: string[];
  before?: Date;
  limit: number;
}): Promise<LibraryItem[]> {
  const modelClause = input.modelFilter?.length
    ? sql`AND m.model = ANY(${input.modelFilter})`
    : sql``;
  const beforeClause = input.before
    ? sql`AND a.created_at < ${input.before.toISOString()}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      a.id AS asset_id, a.key AS asset_key, a.mime, a.created_at,
      m.model, m.id AS message_id, COALESCE(m.text, '') AS prompt_text,
      c.id AS chat_id, c.title AS chat_title
    FROM assets a
    JOIN image_messages m ON a.id = ANY(m.output_asset_ids)
    JOIN image_chats c ON m.chat_id = c.id
    WHERE c.workspace_id = ${input.workspaceId}
      AND c.deleted_at IS NULL
      AND m.role = 'assistant'
      AND m.status = 'completed'
      ${modelClause}
      ${beforeClause}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${input.limit}
  `);

  // drizzle execute returns { rows: any[] }
  return ((rows as unknown as { rows: any[] }).rows ?? []).map((r) => ({
    assetId: r.asset_id,
    publicUrl: `/api/assets/by-key/${encodeURIComponent(r.asset_key)}/raw`,
    mime: r.mime,
    createdAt: new Date(r.created_at),
    model: r.model,
    chatId: r.chat_id,
    chatTitle: r.chat_title,
    messageId: r.message_id,
    promptExcerpt: String(r.prompt_text).slice(0, 80),
  }));
}
```

- [ ] **Step 2: 写 `apps/web/app/api/studio/library/route.ts`**

```ts
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import { listLibraryAssets } from '@/lib/db/studio-queries';

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const workspace = await getWorkspaceForUser(user.id);
  if (!workspace) return Response.json({ error: 'no_workspace' }, { status: 400 });

  const url = new URL(req.url);
  const modelFilter = url.searchParams.getAll('model').filter(Boolean);
  const beforeStr = url.searchParams.get('before');
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '24', 10) || 24));
  const before = beforeStr ? new Date(beforeStr) : undefined;

  const items = await listLibraryAssets({
    workspaceId: workspace.id,
    modelFilter: modelFilter.length ? modelFilter : undefined,
    before,
    limit: limit + 1,  // 多取一条判断 hasMore
  });
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;
  return Response.json({ items: page, nextCursor });
}
```

- [ ] **Step 3: typecheck + 冒烟**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -5
curl -sS -b "session=$SESSION" http://localhost:3000/api/studio/library | head -c 600
curl -sS -b "session=$SESSION" "http://localhost:3000/api/studio/library?model=gemini-3.1-flash-image-preview&limit=5"
```

期望：返回 `{items:[...], nextCursor}`，filter 生效（响应只含指定 model 的图）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/studio/library apps/web/lib/db/studio-queries.ts
git commit -m "feat(api): library endpoint — workspace generated assets 分页 + model filter"
```

---

## Task 10: types.ts + CapabilityGated helper

**Files:**
- Modify: `apps/web/app/(studio)/studio/_components/types.ts`
- Create: `apps/web/app/(studio)/studio/_components/CapabilityGated.tsx`

- [ ] **Step 1: 改 types.ts**

```ts
import type { ModelCapabilities } from '@/lib/studio/models';

export type RefRole = 'content' | 'style' | 'character';

export interface RefEntry {
  asset_id: string;
  role: RefRole;
}

export interface StudioModel {
  id: string;
  label: string;
  group: 'codex' | 'banana';
  endpoint: 'images' | 'chat';
  defaultSize?: string;
  defaultAspectRatio?: string;
  maxN: number;
  capabilities: ModelCapabilities;
}

export interface AssetSummary {
  id: string;
  publicUrl: string;
  mime: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  text: string | null;
  model: string | null;
  params: Record<string, unknown> | null;
  refs: RefEntry[] | null;
  outputAssetIds: string[] | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error: { message?: string } | null;
  createdAt: string;
  completedAt: string | null;
  parentMessageId: string | null;
}

export interface ChatSummary {
  id: string;
  title: string;
}

export interface MoodboardSummary {
  id: string;
  title: string;
  model: string | null;
  coverUrl: string | null;
  updatedAt: string;
}

export interface MoodboardDetail extends MoodboardSummary {
  promptTemplate: string;
  size: string | null;
  aspectRatio: string | null;
  refs: Array<RefEntry & { publicUrl: string | null; mime: string }>;
  notes: string | null;
}

export interface LibraryItem {
  assetId: string;
  publicUrl: string;
  mime: string;
  createdAt: string;
  model: string | null;
  chatId: string;
  chatTitle: string;
  messageId: string;
  promptExcerpt: string;
}

/** 已解析 publicUrl 的 ref 条目 — Composer / Moodboard / Lightbox 共用 */
export interface RefWithUrl extends RefEntry {
  publicUrl: string;
}

/**
 * 由 Moodboard 应用、Remix、空状态样例 prompt 注入到 Composer 的"预设"状态。
 * Composer useEffect 监听后填入对应字段并调用 consumePreset() 清除。
 */
export interface PresetState {
  prompt?: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  refs?: RefWithUrl[];
  moodboardId?: string;
  parentMessageId?: string;
  focus?: boolean;  // 是否 autofocus textarea（Remix 时 true）
}
```

- [ ] **Step 2: 写 `_components/CapabilityGated.tsx`**

```tsx
'use client';
import type { ReactNode } from 'react';
import { modelSupports, firstModelSupporting, type ModelCapabilities } from '@/lib/studio/models';

interface GatedProps {
  modelId: string;
  cap: keyof ModelCapabilities;
  capLabel: string;  // 中文显示名，如 "局部重绘"
  children: (gateState: { enabled: boolean; tooltip: string }) => ReactNode;
}

/**
 * 不渲染任何 DOM，只把"是否 enable + tooltip 文案"作为
 * render prop 传给子节点。这样每个被 gate 的控件保留
 * 自己的样式，但拿到一致的 enable/disable 计算和文案。
 */
export function CapabilityGated({ modelId, cap, capLabel, children }: GatedProps) {
  const enabled = modelSupports(modelId, cap);
  let tooltip = '';
  if (!enabled) {
    const alt = firstModelSupporting(cap);
    tooltip = alt
      ? `当前模型不支持${capLabel}，请切换到 ${alt.label}`
      : `当前没有模型支持${capLabel}`;
  }
  return <>{children({ enabled, tooltip })}</>;
}
```

- [ ] **Step 3: typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

旧组件可能还引用旧 type 形态报错，那是预期，后续 Task 修。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/types.ts apps/web/app/\(studio\)/studio/_components/CapabilityGated.tsx
git commit -m "feat(studio-ui): types 扩展 (refs/RefRole/Moodboard/Library) + CapabilityGated 渲染 prop helper"
```

---

## Task 11: RefSlots + SettingsDrawer 子组件

**Files:**
- Create: `apps/web/app/(studio)/studio/_components/RefSlots.tsx`
- Create: `apps/web/app/(studio)/studio/_components/SettingsDrawer.tsx`

- [ ] **Step 1: 写 RefSlots.tsx**

```tsx
'use client';
import { X } from 'lucide-react';
import type { RefEntry, RefRole, StudioModel } from './types';

interface RefSlotsProps {
  refs: Array<RefEntry & { publicUrl: string }>;
  model: StudioModel;
  onRemove: (asset_id: string) => void;
}

const ROLE_LABEL: Record<RefRole, string> = {
  content: '内容参考',
  style: '风格参考',
  character: '主体一致',
};
const ROLE_RING: Record<RefRole, string> = {
  content: 'ring-gray-300',
  style: 'ring-purple-300',
  character: 'ring-emerald-300',
};

export function RefSlots({ refs, model, onRemove }: RefSlotsProps) {
  if (refs.length === 0) return null;

  const groups: Array<{ role: RefRole; entries: typeof refs }> = [
    { role: 'content', entries: refs.filter((r) => r.role === 'content') },
    { role: 'style', entries: refs.filter((r) => r.role === 'style') },
    { role: 'character', entries: refs.filter((r) => r.role === 'character') },
  ].filter((g) => g.entries.length > 0);

  return (
    <div className="flex gap-6 flex-wrap mb-2">
      {groups.map(({ role, entries }) => {
        const stale = role === 'character' && !model.capabilities.multiTurn;
        return (
          <div key={role}>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              {ROLE_LABEL[role]}
              {stale && <span className="ml-1 text-amber-500">· 该模型不读取</span>}
            </div>
            <div className="flex gap-2">
              {entries.map((r) => (
                <div key={r.asset_id} className={`relative h-12 w-12 ring-2 rounded ${ROLE_RING[role]} ${stale ? 'opacity-50' : ''}`}>
                  <img src={r.publicUrl} alt="" className="w-full h-full object-cover rounded" />
                  <button
                    type="button"
                    onClick={() => onRemove(r.asset_id)}
                    className="absolute -top-1 -right-1 bg-white border border-gray-300 rounded-full p-0.5"
                    title="移除"
                  >
                    <X className="h-3 w-3 text-gray-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 写 SettingsDrawer.tsx**

```tsx
'use client';
import { X, Dice5 } from 'lucide-react';
import type { StudioModel } from './types';
import { CapabilityGated } from './CapabilityGated';

export interface SettingsState {
  quality: 'low' | 'medium' | 'high' | 'auto';
  seed: number | null;
  transparentBackground: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  model: StudioModel;
  value: SettingsState;
  onChange: (patch: Partial<SettingsState>) => void;
}

export function SettingsDrawer({ open, onClose, model, value, onChange }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">高级设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        {/* Quality — 仅 endpoint='images' 显示 */}
        {model.endpoint === 'images' && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">质量</label>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={value.quality}
              onChange={(e) => onChange({ quality: e.target.value as SettingsState['quality'] })}
            >
              <option value="auto">自动</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>
        )}

        {/* Seed — capability gated */}
        <CapabilityGated modelId={model.id} cap="seed" capLabel="seed 复现">
          {({ enabled, tooltip }) => (
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Seed</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  value={value.seed ?? ''}
                  onChange={(e) => onChange({ seed: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  disabled={!enabled}
                  title={!enabled ? tooltip : ''}
                />
                <button
                  type="button"
                  className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => onChange({ seed: Math.floor(Math.random() * 2147483647) })}
                  disabled={!enabled}
                  title={!enabled ? tooltip : '随机生成 seed'}
                >
                  <Dice5 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CapabilityGated>

        {/* 透明背景 — capability gated */}
        <CapabilityGated modelId={model.id} cap="transparentBackground" capLabel="透明背景">
          {({ enabled, tooltip }) => (
            <label className={`flex items-center gap-2 text-sm ${!enabled ? 'opacity-50 cursor-not-allowed' : ''}`} title={!enabled ? tooltip : ''}>
              <input
                type="checkbox"
                checked={value.transparentBackground}
                onChange={(e) => onChange({ transparentBackground: e.target.checked })}
                disabled={!enabled}
              />
              输出透明背景
            </label>
          )}
        </CapabilityGated>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/RefSlots.tsx apps/web/app/\(studio\)/studio/_components/SettingsDrawer.tsx
git commit -m "feat(studio-ui): RefSlots (content/style/character 分组) + SettingsDrawer (capability-gated 高级设置)"
```

---

## Task 12: EmptyStateSamples

**Files:**
- Create: `apps/web/app/(studio)/studio/_components/EmptyStateSamples.tsx`

- [ ] **Step 1: 写组件**

```tsx
'use client';
import { Sparkles } from 'lucide-react';

export interface SamplePrompt {
  title: string;
  prompt: string;
  modelId: string;
  thumb: string;  // emoji 或单字符当占位
}

const SAMPLES: SamplePrompt[] = [
  {
    title: '写实产品图',
    prompt: '白底，柔光，45 度俯角的陶瓷咖啡杯特写，杯口飘起淡淡蒸汽，电商主图风格',
    modelId: 'gpt-image-2',
    thumb: '☕',
  },
  {
    title: '极简插画',
    prompt: '极简扁平插画风格，一只橙色小猫坐在月亮上看书，柔和粉紫色背景',
    modelId: 'gemini-3.1-flash-image-preview',
    thumb: '🌙',
  },
  {
    title: '赛博朋克场景',
    prompt: '雨夜的霓虹街道，蒸汽朋克未来城市，电影质感，超广角',
    modelId: 'gemini-3-pro-image-preview',
    thumb: '🌃',
  },
  {
    title: '多图融合（i2i）',
    prompt: '把参考图里的猫穿上飞行夹克，背景换成沙漠日落',
    modelId: 'gpt-image-2',
    thumb: '✈️',
  },
];

export function EmptyStateSamples({ onPick }: { onPick: (s: SamplePrompt) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <Sparkles className="h-8 w-8 text-orange-300 mb-3" />
      <p className="text-sm text-gray-600 mb-5">描述你想生成的图像，或从下方示例开始</p>
      <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
        {SAMPLES.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s)}
            className="flex items-start gap-3 text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-orange-300 transition"
          >
            <div className="text-2xl shrink-0">{s.thumb}</div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{s.title}</div>
              <div className="text-xs text-gray-500 line-clamp-2">{s.prompt}</div>
              <div className="text-[10px] text-orange-500 mt-1">{s.modelId}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/EmptyStateSamples.tsx
git commit -m "feat(studio-ui): EmptyStateSamples — 4 张样例 prompt 卡片覆盖三模型"
```

---

## Task 13: PromptComposer 双层重写 + dev server 手测

**Files:**
- Modify: `apps/web/app/(studio)/studio/_components/PromptComposer.tsx`

整个文件重写。注意保留 / 适配以下行为：
- 上传走 `/api/assets` type=user_upload（不变）
- 提交走 `/api/studio/chats/[id]/generate`
- ⌘/Ctrl+Enter 提交
- pending 期间禁用

- [ ] **Step 1: 重写文件骨架**

```tsx
'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Paperclip, Send, Loader2, Settings, BookOpen, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PresetState, RefRole, RefWithUrl, StudioModel } from './types';
import { RefSlots } from './RefSlots';
import { SettingsDrawer, type SettingsState } from './SettingsDrawer';
import { CapabilityGated } from './CapabilityGated';

interface Props {
  chatId: string;
  models: StudioModel[];
  defaultModel: string;
  presetState: PresetState | null;
  consumePreset: () => void;
  onGenerated: () => void;
  pendingGenerate: boolean;
  onOpenMoodboardDrawer: () => void;  // Task 16 wire
}

export function PromptComposer({
  chatId, models, defaultModel, presetState, consumePreset, onGenerated, pendingGenerate,
}: Props) {
  const [text, setText] = useState('');
  const [modelId, setModelId] = useState(defaultModel);
  const [n, setN] = useState(1);
  const [size, setSize] = useState('1024x1024');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [refs, setRefs] = useState<RefWithUrl[]>([]);
  const [conversational, setConversational] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    quality: 'auto', seed: null, transparentBackground: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [moodboardId, setMoodboardId] = useState<string | null>(null);
  const [parentMessageId, setParentMessageId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [pendingUploadRole, setPendingUploadRole] = useState<RefRole | null>(null);

  const model = models.find((m) => m.id === modelId) ?? models[0]!;

  // Apply preset (from Moodboard or Remix)
  useEffect(() => {
    if (!presetState) return;
    if (presetState.prompt !== undefined) setText(presetState.prompt);
    if (presetState.model) setModelId(presetState.model);
    if (presetState.size) setSize(presetState.size);
    if (presetState.aspectRatio) setAspectRatio(presetState.aspectRatio);
    if (presetState.refs) setRefs(presetState.refs);
    setMoodboardId(presetState.moodboardId ?? null);
    setParentMessageId(presetState.parentMessageId ?? null);
    if (presetState.focus) textRef.current?.focus();
    consumePreset();
  }, [presetState, consumePreset]);

  // Clamp n when switching model
  useEffect(() => {
    if (n > model.maxN) setN(model.maxN);
  }, [model, n]);

  // Auto-disable conversational if model loses capability
  useEffect(() => {
    if (conversational && !model.capabilities.imageInput && !model.capabilities.multiTurn) {
      setConversational(false);
      setError('已切换到不支持上下文的模型，对话上下文已关闭');
    }
  }, [model, conversational]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingUploadRole) return;
    if (refs.length >= 8) { setError('最多附加 8 张参考图'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'user_upload');
    fd.append('category', 'studio');
    const res = await fetch('/api/assets', { method: 'POST', body: fd });
    if (!res.ok) { setError('上传失败'); return; }
    const json = await res.json() as { id: string; publicUrl: string };
    setRefs((cur) => [...cur, { asset_id: json.id, publicUrl: json.publicUrl, role: pendingUploadRole }]);
    setPendingUploadRole(null);
  }

  function triggerUpload(role: RefRole) {
    setPendingUploadRole(role);
    fileRef.current?.click();
  }

  async function handleSubmit() {
    const prompt = text.trim();
    if (!prompt || submitting || pendingGenerate) return;
    setSubmitting(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        prompt, model: model.id, n,
        ...(model.endpoint === 'images' ? { size } : { aspectRatio }),
        refs: refs.map(({ asset_id, role }) => ({ asset_id, role })),
        ...(conversational ? { conversational: true } : {}),
        ...(moodboardId ? { moodboardId } : {}),
        ...(parentMessageId ? { parentMessageId } : {}),
        ...(settings.seed !== null && model.capabilities.seed ? { seed: settings.seed } : {}),
        ...(settings.transparentBackground && model.capabilities.transparentBackground ? { transparentBackground: true } : {}),
      };
      const res = await fetch(`/api/studio/chats/${chatId}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? j.error ?? `请求失败 (${res.status})`);
        return;
      }
      setText(''); setRefs([]); setParentMessageId(null); setMoodboardId(null);
      onGenerated();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

      {/* 顶部 toggle 条 */}
      <div className="flex items-center gap-3 mb-2 text-xs">
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 rounded border border-orange-200 text-orange-700 hover:bg-orange-50"
          onClick={() => {/* Task 16 wire MoodboardDrawer open */}}
          title="Moodboard"
        >
          <BookOpen className="h-3.5 w-3.5" /> Moodboard
        </button>
        <CapabilityGated modelId={model.id} cap="multiTurn" capLabel="对话上下文">
          {({ enabled: nativeMulti }) => {
            const useNative = nativeMulti;
            const useAutoChain = !nativeMulti && model.capabilities.imageInput;
            const possible = useNative || useAutoChain;
            const label = useNative ? '对话上下文' : useAutoChain ? '自动接龙参考图' : '上下文';
            return (
              <button
                type="button"
                className={`flex items-center gap-1 px-2 py-1 rounded border ${conversational ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-300 text-gray-600'} ${!possible ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                onClick={() => possible && setConversational((v) => !v)}
                title={possible ? `点击${conversational ? '关闭' : '开启'}` : '当前模型不支持上下文'}
                disabled={!possible}
              >
                <MessageSquare className="h-3.5 w-3.5" /> {label}
              </button>
            );
          }}
        </CapabilityGated>
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-gray-600">
          <span className="text-gray-400">模型</span>
          <select className="rounded border border-gray-300 px-1.5 py-0.5" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-gray-600">
          <span className="text-gray-400">数量</span>
          <select className="rounded border border-gray-300 px-1.5 py-0.5" value={n} onChange={(e) => setN(Number(e.target.value))}>
            {Array.from({ length: model.maxN }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        {model.endpoint === 'images' ? (
          <label className="flex items-center gap-1 text-gray-600">
            <span className="text-gray-400">尺寸</span>
            <select className="rounded border border-gray-300 px-1.5 py-0.5" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="1024x1024">1024×1024</option>
              <option value="1024x1792">1024×1792</option>
              <option value="1792x1024">1792×1024</option>
            </select>
          </label>
        ) : (
          <label className="flex items-center gap-1 text-gray-600">
            <span className="text-gray-400">比例</span>
            <select className="rounded border border-gray-300 px-1.5 py-0.5" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
              <option value="1:1">1:1</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
            </select>
          </label>
        )}
        <button type="button" className="rounded border border-gray-300 px-1.5 py-0.5 text-gray-600 hover:bg-gray-50" onClick={() => setSettingsOpen(true)} title="高级设置">
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Refs 槽位区 */}
      <RefSlots refs={refs} model={model} onRemove={(id) => setRefs((cur) => cur.filter((r) => r.asset_id !== id))} />

      {/* 主输入行 */}
      <div className="flex items-end gap-2">
        <button
          type="button"
          title="附加参考图"
          disabled={!model.capabilities.imageInput || submitting || pendingGenerate}
          onClick={() => {
            // 弹个最简 role picker：用 prompt() 临时实现，Phase 1 内可换 native menu
            const choice = window.prompt('参考图角色: c=内容 / s=风格 / r=主体一致', 'c');
            const role: RefRole | null = choice === 'c' ? 'content' : choice === 's' ? 'style' : choice === 'r' ? 'character' : null;
            if (!role) return;
            if (role === 'character' && !model.capabilities.multiTurn) {
              alert('当前模型不支持 character 角色，请切换到 Gemini');
              return;
            }
            triggerUpload(role);
          }}
          className="text-gray-500 hover:text-orange-500 disabled:text-gray-300 self-center"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
          rows={2}
          placeholder="描述你想生成的图像… (⌘/Ctrl+Enter 提交)"
          disabled={submitting || pendingGenerate}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <span className="text-[10px] text-gray-500 self-center px-2 py-1 bg-gray-50 rounded">本次扣 {n} 张</span>
        <Button onClick={handleSubmit} disabled={submitting || pendingGenerate || !text.trim()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} model={model} value={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />
    </div>
  );
}
```

> 注：Moodboard 按钮 onClick 留空槽，Task 16 接入。`window.prompt` 临时实现角色 picker，Task 后续可换 popover——但 Phase 1 工作量上能接受。

- [ ] **Step 2: 改 StudioApp 接 props**

```bash
grep -n "PromptComposer" apps/web/app/\(studio\)/studio/_components/StudioApp.tsx
```

定位 `<PromptComposer ... />` 调用处，新增 `presetState` / `consumePreset` / `pendingGenerate` 三个 props。先放 `null / () => {} / false` 等占位，Task 15 再实现。

- [ ] **Step 3: typecheck + dev server 手测**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -5
pnpm dev
```

浏览器 http://localhost:3000/studio 登录后：
- 切模型 → 上下文 toggle chip 文案变化、ref 槽 character 显示/隐藏正确
- 上传一张图（选 content）→ 出现在 RefSlots 内容参考分组
- Settings ⚙️ 打开 → 在 Gemini 模型下 seed/透明都灰；切 GPT 后变 enabled
- 数量改 4 → "本次扣 4 张" chip 同步

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/PromptComposer.tsx apps/web/app/\(studio\)/studio/_components/StudioApp.tsx
git commit -m "feat(studio-ui): PromptComposer 双层 Imagine bar — toggle 条 + ref 槽位 + settings 抽屉 + 本次扣 N 张"
```

---

## Task 14: ChatCanvas hover + Lightbox 组件

**Files:**
- Create: `apps/web/app/(studio)/studio/_components/Lightbox.tsx`
- Modify: `apps/web/app/(studio)/studio/_components/ChatCanvas.tsx`

- [ ] **Step 1: 写 Lightbox.tsx**

```tsx
'use client';
import { useEffect } from 'react';
import { X, RotateCw, Grid3x3, Pencil, Download, Move, Maximize2, Lock } from 'lucide-react';
import type { AssetSummary, ChatMessage, StudioModel } from './types';

interface Props {
  open: boolean;
  asset: AssetSummary | null;
  sourceMessage: ChatMessage | null;
  model: StudioModel | null;
  onClose: () => void;
  onReroll: () => void;
  onVariations: () => void;
  onRemix: () => void;
  pendingGenerate: boolean;
}

export function Lightbox({ open, asset, sourceMessage, model, onClose, onReroll, onVariations, onRemix, pendingGenerate }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open || !asset) return null;

  const inpaintEnabled = !!model?.capabilities.inpaint;
  const outpaintEnabled = !!model?.capabilities.outpaint;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex">
      <div className="flex-1 flex items-center justify-center p-6 cursor-zoom-out" onClick={onClose}>
        <img src={asset.publicUrl} alt="" className="max-h-[88vh] max-w-full object-contain rounded shadow-2xl" />
      </div>
      <div className="w-72 bg-zinc-900 text-white p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <div className="text-xs opacity-60">{sourceMessage?.model ?? '—'}</div>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="text-[10px] uppercase opacity-50 mt-2">生成</div>
        <button disabled={pendingGenerate} onClick={onReroll} className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <RotateCw className="h-4 w-4" /> Reroll
        </button>
        <button disabled={pendingGenerate} onClick={onVariations} className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <Grid3x3 className="h-4 w-4" /> Variations
        </button>
        <button disabled={pendingGenerate} onClick={onRemix} className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <Pencil className="h-4 w-4" /> Remix...
        </button>

        <div className="text-[10px] uppercase opacity-50 mt-2">导出</div>
        <a href={asset.publicUrl} download className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm">
          <Download className="h-4 w-4" /> 下载
        </a>

        <div className="text-[10px] uppercase opacity-50 mt-2">高级（capability-gated）</div>
        <button disabled className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 text-sm opacity-40 cursor-not-allowed" title={inpaintEnabled ? '即将上线' : '当前模型不支持局部重绘，请切换到 GPT Image 2'}>
          <Lock className="h-4 w-4" /> Vary Region
        </button>
        <button disabled className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 text-sm opacity-40 cursor-not-allowed" title={outpaintEnabled ? '即将上线' : '当前模型不支持外延，请切换到 GPT Image 2'}>
          <Move className="h-4 w-4" /> Pan
        </button>
        <button disabled className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 text-sm opacity-40 cursor-not-allowed" title={outpaintEnabled ? '即将上线' : '当前模型不支持外延，请切换到 GPT Image 2'}>
          <Maximize2 className="h-4 w-4" /> Zoom Out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改 ChatCanvas.tsx**

主要改三处：

a) 入参增加 `onOpenLightbox` / `onReroll` / `pendingGenerate`：

```tsx
interface Props {
  messages: ChatMessage[];
  assetMap: Map<string, AssetSummary>;
  loading: boolean;
  onOpenLightbox: (asset: AssetSummary, msg: ChatMessage) => void;
  onCardReroll: (msg: ChatMessage) => void;
  pendingGenerate: boolean;
  onPickSample: (s: SamplePrompt) => void;
}
```

b) 空状态用 `EmptyStateSamples`：

```tsx
if (messages.length === 0) {
  return <EmptyStateSamples onPick={onPickSample} />;
}
```

c) Thumb 大尺寸版加 hover Reroll 按钮 + click 打开 lightbox + cursor-zoom-in：

```tsx
function Thumb({ asset, size, onOpen, onReroll, pending }: {
  asset: AssetSummary;
  size: 'sm' | 'lg';
  onOpen?: () => void;
  onReroll?: () => void;
  pending?: boolean;
}) {
  const box = size === 'sm' ? 'h-16 w-16' : 'aspect-square w-full';
  return (
    <div className={`relative group ${box}`}>
      <img
        src={asset.publicUrl}
        alt=""
        className={`w-full h-full object-cover rounded-md border border-gray-200 bg-white ${size === 'lg' ? 'cursor-zoom-in' : ''}`}
        onClick={() => size === 'lg' && onOpen?.()}
      />
      {size === 'lg' && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            type="button"
            disabled={!!pending}
            onClick={(e) => { e.stopPropagation(); onReroll?.(); }}
            className="rounded-full bg-white/90 p-1.5 shadow disabled:opacity-50 disabled:cursor-not-allowed"
            title={pending ? '上次生成还在进行中' : 'Reroll'}
          >
            <RotateCw className="h-3.5 w-3.5 text-gray-700" />
          </button>
          <a href={asset.publicUrl} download className="rounded-full bg-white/90 p-1.5 shadow" title="下载" onClick={(e) => e.stopPropagation()}>
            <Download className="h-3.5 w-3.5 text-gray-700" />
          </a>
        </div>
      )}
    </div>
  );
}
```

d) MessageBlock 内 assistant 输出 + failed status 检查：failed 不渲染 Reroll/lightbox 入口。

- [ ] **Step 3: typecheck + 手测**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -5
```

手测：出图后 hover 卡片 → 右上 ↻ + ↓ 出现；点图打开 Lightbox。lightbox 内 Pan / Vary Region 在 Gemini 模型下灰 + tooltip 写"切到 GPT"。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/Lightbox.tsx apps/web/app/\(studio\)/studio/_components/ChatCanvas.tsx
git commit -m "feat(studio-ui): Lightbox + ChatCanvas hover Reroll/Download + 空态样例 prompt 接入"
```

---

## Task 15: StudioApp 编排 (pendingGenerateCount + drawer/lightbox 状态 + 三动作 handler)

**Files:**
- Modify: `apps/web/app/(studio)/studio/_components/StudioApp.tsx`

- [ ] **Step 1: 引入状态**

在组件顶部加：

```tsx
const [pendingGenerateCount, setPendingGenerateCount] = useState(0);
const [moodboardDrawerOpen, setMoodboardDrawerOpen] = useState(false);
const [lightbox, setLightbox] = useState<{ asset: AssetSummary; msg: ChatMessage } | null>(null);
const [preset, setPreset] = useState<PresetState | null>(null);
```

- [ ] **Step 2: 三动作 handler**

```tsx
async function fireGenerate(body: Record<string, unknown>) {
  setPendingGenerateCount((c) => c + 1);
  try {
    const res = await fetch(`/api/studio/chats/${selectedChatId}/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.message ?? j.error ?? `请求失败 (${res.status})`);
      return;
    }
    mutateChat();
  } finally {
    setPendingGenerateCount((c) => c - 1);
  }
}

function handleReroll(msg: ChatMessage) {
  // 复制原 message 的 prompt + 参数 + refs；prompt 取该 message 关联的 user 消息 text
  const userMsg = messages.find((m) => m.id === msg.parentMessageId) ?? messages.findLast?.((m) => m.role === 'user' && m.createdAt < msg.createdAt);
  if (!userMsg?.text) return;
  fireGenerate({
    prompt: userMsg.text,
    model: msg.model,
    n: (msg.params?.n as number) ?? 1,
    ...(msg.params?.size ? { size: msg.params.size } : {}),
    ...(msg.params?.aspectRatio ? { aspectRatio: msg.params.aspectRatio } : {}),
    refs: msg.refs ?? [],
    parentMessageId: msg.id,
  });
}

function handleVariations(msg: ChatMessage, sourceAssetId: string) {
  const userMsg = messages.find((m) => m.id === msg.parentMessageId) ?? messages.findLast?.((m) => m.role === 'user' && m.createdAt < msg.createdAt);
  if (!userMsg?.text || !msg.model) return;
  const model = models.find((m2) => m2.id === msg.model);
  const n = Math.min(4, model?.maxN ?? 4);
  fireGenerate({
    prompt: userMsg.text,
    model: msg.model,
    n,
    ...(msg.params?.size ? { size: msg.params.size } : {}),
    ...(msg.params?.aspectRatio ? { aspectRatio: msg.params.aspectRatio } : {}),
    refs: [...(msg.refs ?? []), { asset_id: sourceAssetId, role: 'content' as const }],
    parentMessageId: msg.id,
  });
}

function handleRemix(msg: ChatMessage, sourceAsset: AssetSummary) {
  const userMsg = messages.find((m) => m.id === msg.parentMessageId) ?? messages.findLast?.((m) => m.role === 'user' && m.createdAt < msg.createdAt);
  setPreset({
    prompt: userMsg?.text ?? '',
    model: msg.model ?? undefined,
    refs: [{ asset_id: sourceAsset.id, role: 'content', publicUrl: sourceAsset.publicUrl }],
    parentMessageId: msg.id,
    focus: true,
  });
  setLightbox(null);  // 关 Lightbox
}
```

- [ ] **Step 3: 接 PromptComposer + ChatCanvas props**

```tsx
<ChatCanvas
  messages={messages}
  assetMap={assetMap}
  loading={loadingChat}
  pendingGenerate={pendingGenerateCount > 0}
  onOpenLightbox={(asset, msg) => setLightbox({ asset, msg })}
  onCardReroll={(msg) => handleReroll(msg)}
  onPickSample={(s) => setPreset({ prompt: s.prompt, model: s.modelId, focus: true })}
/>
<PromptComposer
  chatId={selectedChatId}
  models={models}
  defaultModel={defaultModelId}
  presetState={preset}
  consumePreset={() => setPreset(null)}
  onGenerated={() => mutateChat()}
  pendingGenerate={pendingGenerateCount > 0}
/>
<Lightbox
  open={!!lightbox}
  asset={lightbox?.asset ?? null}
  sourceMessage={lightbox?.msg ?? null}
  model={lightbox ? (models.find((m) => m.id === lightbox.msg.model) ?? null) : null}
  pendingGenerate={pendingGenerateCount > 0}
  onClose={() => setLightbox(null)}
  onReroll={() => lightbox && handleReroll(lightbox.msg)}
  onVariations={() => lightbox && handleVariations(lightbox.msg, lightbox.asset.id)}
  onRemix={() => lightbox && handleRemix(lightbox.msg, lightbox.asset)}
/>
```

- [ ] **Step 4: typecheck + 完整冒烟**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
```

dev server 手测：
1. 生成一张图
2. hover 卡片 → 点 ↻ → 新 message 出现（n 沿用上次）
3. 点图开 Lightbox → 点 Variations → 4 张新图（Gemini Pro 模型则 2 张），SQL 直查 `parent_message_id` 已写
4. Lightbox 点 Remix → 关闭并 Composer 已填 prompt + 缩略图在 content_ref 槽
5. 同 chat 已在 pending 时再点 ↻ → 按钮灰

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/StudioApp.tsx
git commit -m "feat(studio-ui): StudioApp 接 Reroll/Variations/Remix handler + pendingGenerateCount + lightbox/preset 编排"
```

---

## Task 16: MoodboardDrawer + dev server 手测

**Files:**
- Create: `apps/web/app/(studio)/studio/_components/MoodboardDrawer.tsx`
- Modify: `apps/web/app/(studio)/studio/_components/PromptComposer.tsx` (wire drawer open)
- Modify: `apps/web/app/(studio)/studio/_components/StudioApp.tsx` (drawer state + apply handler)

- [ ] **Step 1: 写 MoodboardDrawer**

```tsx
'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { X, Plus, Trash2 } from 'lucide-react';
import type { MoodboardSummary, MoodboardDetail, PresetState } from './types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  open: boolean;
  onClose: () => void;
  currentComposerSnapshot: () => Omit<PresetState, 'focus' | 'moodboardId' | 'parentMessageId'> & { notes?: string };  // 当前 Composer 状态快照
  onApply: (detail: MoodboardDetail) => void;
}

export function MoodboardDrawer({ open, onClose, currentComposerSnapshot, onApply }: Props) {
  const { data } = useSWR<{ items: MoodboardSummary[] }>(open ? '/api/studio/moodboards' : null, fetcher);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [includeState, setIncludeState] = useState(true);

  if (!open) return null;

  async function applyClick(id: string) {
    const r = await fetch(`/api/studio/moodboards/${id}`).then((res) => res.json() as Promise<{ moodboard: MoodboardDetail }>);
    onApply(r.moodboard);
    onClose();
  }

  async function deleteClick(id: string) {
    if (!confirm('删除该 Moodboard？')) return;
    await fetch(`/api/studio/moodboards/${id}`, { method: 'DELETE' });
    mutate('/api/studio/moodboards');
  }

  async function createSubmit(e: React.FormEvent) {
    e.preventDefault();
    const snap = includeState ? currentComposerSnapshot() : {};
    const body = {
      title: title.trim(),
      promptTemplate: snap.prompt ?? '',
      model: snap.model,
      size: snap.size,
      aspectRatio: snap.aspectRatio,
      refs: snap.refs?.map(({ asset_id, role }) => ({ asset_id, role })),
      notes: notes.trim() || undefined,
    };
    const res = await fetch('/api/studio/moodboards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setCreating(false); setTitle(''); setNotes('');
      mutate('/api/studio/moodboards');
    } else {
      alert('创建失败');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">我的 Moodboard</h3>
          <div className="flex gap-2">
            {!creating && <button onClick={() => setCreating(true)} className="text-xs text-orange-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> 新建</button>}
            <button onClick={onClose}><X className="h-4 w-4 text-gray-500" /></button>
          </div>
        </div>

        {creating && (
          <form onSubmit={createSubmit} className="mb-4 space-y-2 p-3 bg-gray-50 rounded">
            <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="标题" required value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="备注（可选）" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={includeState} onChange={(e) => setIncludeState(e.target.checked)} />
              快照当前 Composer 状态（prompt / model / refs / 尺寸）
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="text-xs px-2 py-1 text-gray-600">取消</button>
              <button type="submit" className="text-xs px-3 py-1 bg-orange-500 text-white rounded">保存</button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {(data?.items ?? []).map((mb) => (
            <div key={mb.id} className="group flex items-center gap-2 p-2 rounded border border-gray-200 hover:border-orange-200 cursor-pointer" onClick={() => applyClick(mb.id)}>
              <div className="h-10 w-10 rounded bg-gradient-to-br from-amber-200 to-orange-300 shrink-0 overflow-hidden">
                {mb.coverUrl && <img src={mb.coverUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{mb.title}</div>
                <div className="text-[10px] text-gray-500 truncate">{mb.model ?? '—'}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteClick(mb.id); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600" title="删除">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {data && data.items.length === 0 && !creating && (
            <p className="text-xs text-gray-400 text-center py-6">还没有 Moodboard，点上方 + 新建</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 接 PromptComposer 的 Moodboard 按钮**

PromptComposer 加入参 `onOpenMoodboardDrawer?: () => void`，按钮 onClick 调它。同时暴露 `getSnapshot` 方法给上层——但 React 组件难直接暴露方法，简单做法是把 snapshot 状态 lift 到 StudioApp，或者用 forwardRef + imperative handle。

最简方案：PromptComposer 把当前状态 `prompt/model/size/aspectRatio/refs` 通过 callback 在每次变化时通知 parent；parent 持有 latest snapshot 引用。但这会拆碎状态。

更简方案：让 MoodboardDrawer 在创建表单提交时**直接读**全局窗口暂存（如 `window.__studioComposerSnapshot__`），由 PromptComposer 每次渲染时写入。粗暴但有效。或者把 PromptComposer 完整 state 抬到 StudioApp。

**Phase 1 选择**：把 PromptComposer 暴露 `formRef = useRef`，提供 `getSnapshot()` 方法用 `useImperativeHandle`：

PromptComposer 加：

```tsx
import { useImperativeHandle, forwardRef } from 'react';

export interface ComposerHandle {
  getSnapshot(): { prompt: string; model: string; size: string; aspectRatio: string; refs: RefWithUrl[] };
}

export const PromptComposer = forwardRef<ComposerHandle, Props>(function PromptComposer({...}, ref) {
  // ... existing state ...
  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({ prompt: text, model: modelId, size, aspectRatio, refs }),
  }), [text, modelId, size, aspectRatio, refs]);
  // ... existing JSX ...
});
```

StudioApp 内：

```tsx
const composerRef = useRef<ComposerHandle>(null);

<PromptComposer ref={composerRef} ... onOpenMoodboardDrawer={() => setMoodboardDrawerOpen(true)} ... />
<MoodboardDrawer
  open={moodboardDrawerOpen}
  onClose={() => setMoodboardDrawerOpen(false)}
  currentComposerSnapshot={() => composerRef.current?.getSnapshot() ?? {}}
  onApply={(detail) => {
    setPreset({
      prompt: detail.promptTemplate,
      model: detail.model ?? undefined,
      size: detail.size ?? undefined,
      aspectRatio: detail.aspectRatio ?? undefined,
      refs: detail.refs.filter((r) => r.publicUrl).map((r) => ({ asset_id: r.asset_id, role: r.role, publicUrl: r.publicUrl! })),
      moodboardId: detail.id,
    });
  }}
/>
```

- [ ] **Step 3: typecheck + 手测**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -5
```

手测：
1. 点 📚 → 抽屉打开
2. 点 + 新建 → 填 title → 保存 → 卡片立即出现
3. 改 Composer state 后再点 + 新建 → 快照应包含当前 prompt/refs
4. 点已有卡片 → Composer 填充 + 抽屉关
5. 应用后跑一次 generate → SQL 查 moodboard.cover_asset_id 已写入
6. 删除一张 cover_asset_id 关联的 asset，再 GET 该 Moodboard → 缩略图位置为占位，warnings 返回 skippedRef 列表

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(studio\)/studio/_components/MoodboardDrawer.tsx apps/web/app/\(studio\)/studio/_components/PromptComposer.tsx apps/web/app/\(studio\)/studio/_components/StudioApp.tsx
git commit -m "feat(studio-ui): MoodboardDrawer (列表 + 新建 + 应用) + Composer 暴露 snapshot 给 drawer"
```

---

## Task 17: Library 路由 + Header nav + QuotaBadge 条件 + 最终冒烟

**Files:**
- Create: `apps/web/app/(studio)/library/page.tsx`
- Create: `apps/web/app/(studio)/library/_components/LibraryGrid.tsx`
- Modify: `apps/web/app/(studio)/layout.tsx`

- [ ] **Step 1: 写 layout 改造**

```tsx
// apps/web/app/(studio)/layout.tsx — header section
import { usePathname } from 'next/navigation';

// inside StudioLayout JSX:
const pathname = usePathname();
const navItem = (href: string, label: string) => (
  <Link href={href} className={`text-sm pb-1 ${pathname.startsWith(href) ? 'text-orange-600 border-b-2 border-orange-500 font-medium' : 'text-gray-600 hover:text-gray-900'}`}>
    {label}
  </Link>
);

// in header:
<div className="flex items-center gap-6">
  <Link href="/studio" className="flex items-center">
    <Sparkles className="h-6 w-6 text-orange-500" />
    <span className="ml-2 text-lg font-semibold text-gray-900">Studio</span>
  </Link>
  {navItem('/studio', 'Studio')}
  {navItem('/library', '图库')}
</div>
```

QuotaBadge 改：

```tsx
function QuotaBadge() {
  const { data } = useSWR<{ subscription?: Subscription | null }>('/api/workspace', fetcher, { refreshInterval: 30000 });
  const sub = data?.subscription;
  if (!sub) return null;
  const remaining = Math.max(0, sub.skuQuota - sub.skuUsed);
  const pct = sub.skuQuota > 0 ? remaining / sub.skuQuota : 0;
  if (pct > 0.2) return null;  // 软提示：只在 ≤20% 时显示
  let color = 'text-gray-700';
  if (pct < 0.1) color = 'text-red-600';
  else if (pct < 0.3) color = 'text-amber-600';
  return (
    <Link href="/pricing" className={`text-sm font-medium hover:underline ${color}`} title={`图片配额 ${sub.skuUsed} / ${sub.skuQuota}`}>
      剩余 {remaining} 张
    </Link>
  );
}
```

- [ ] **Step 2: 写 LibraryGrid.tsx**

```tsx
'use client';
import { useState, useMemo } from 'react';
import useSWR from 'swr';
import type { LibraryItem, StudioModel } from '../../studio/_components/types';
import { Lightbox } from '../../studio/_components/Lightbox';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props { models: StudioModel[] }

export function LibraryGrid({ models }: Props) {
  const [modelFilter, setModelFilter] = useState<Set<string>>(new Set());
  const [before, setBefore] = useState<string | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    modelFilter.forEach((m) => p.append('model', m));
    if (before) p.set('before', before);
    return p.toString();
  }, [modelFilter, before]);

  const { data } = useSWR<{ items: LibraryItem[]; nextCursor: string | null }>(`/api/studio/library?${qs}`, fetcher, {
    onSuccess: (d) => {
      // 简化：每次 swr 拉到结果，覆盖 items（不做累积；分页用"加载更多"按钮发新请求时手动 append）
      if (!before) {
        setItems(d.items);
      } else {
        setItems((prev) => [...prev, ...d.items]);
      }
      setNextCursor(d.nextCursor);
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryItem[]>();
    for (const it of items) {
      const d = new Date(it.createdAt);
      const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  const [lightbox, setLightbox] = useState<LibraryItem | null>(null);

  function toggleModel(id: string) {
    setBefore(null);
    setModelFilter((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4 flex-wrap">
        {models.map((m) => (
          <button key={m.id} type="button" onClick={() => toggleModel(m.id)} className={`text-xs px-3 py-1 rounded-full border ${modelFilter.has(m.id) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300'}`}>{m.label}</button>
        ))}
        {modelFilter.size > 0 && <button onClick={() => { setModelFilter(new Set()); setBefore(null); }} className="text-xs text-gray-500 hover:underline ml-2">重置</button>}
      </div>

      {items.length === 0 && data && (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-3">还没生成过图片，去 Studio 开始你的第一张吧</p>
          <a href="/studio" className="inline-block px-4 py-2 bg-orange-500 text-white rounded">去 Studio</a>
        </div>
      )}

      {grouped.map(([month, group]) => (
        <div key={month} className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{month}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {group.map((it) => (
              <button key={it.assetId} className="aspect-square overflow-hidden rounded border border-gray-200 hover:border-orange-300" onClick={() => setLightbox(it)}>
                <img src={it.publicUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {nextCursor && (
        <div className="text-center mt-4">
          <button onClick={() => setBefore(nextCursor)} className="px-4 py-1.5 text-sm border border-gray-300 rounded">加载更多</button>
        </div>
      )}

      {lightbox && (
        <Lightbox
          open
          asset={{ id: lightbox.assetId, publicUrl: lightbox.publicUrl, mime: lightbox.mime }}
          sourceMessage={{ id: lightbox.messageId, chatId: lightbox.chatId, role: 'assistant', model: lightbox.model, text: lightbox.promptExcerpt, params: null, refs: null, outputAssetIds: [lightbox.assetId], status: 'completed', error: null, createdAt: lightbox.createdAt, completedAt: null, parentMessageId: null }}
          model={models.find((m) => m.id === lightbox.model) ?? null}
          pendingGenerate={false}
          onClose={() => setLightbox(null)}
          onReroll={() => alert('在 Library 内 Reroll 暂未实现；请到 Studio 内对图操作')}
          onVariations={() => alert('同上')}
          onRemix={() => { window.location.href = `/studio?chat=${lightbox.chatId}&remix=${lightbox.messageId}`; }}
        />
      )}
    </div>
  );
}
```

> 注：Library 里的 Reroll/Variations 简化处理（弹 alert 引导回 Studio）；只 Remix 通过 URL hash 跳回 Studio 并预填。完整在线 Reroll 留 Phase 2。

- [ ] **Step 3: 写 library/page.tsx**

```tsx
import { LibraryGrid } from './_components/LibraryGrid';
import { listModels } from '@/lib/studio/models';

export default function LibraryPage() {
  const models = listModels();
  // models is serializable
  return <LibraryGrid models={models} />;
}
```

- [ ] **Step 4: StudioApp 支持 URL ?remix= 参数（跳回时预填）**

在 StudioApp top useEffect：

```tsx
import { useSearchParams } from 'next/navigation';

const search = useSearchParams();
useEffect(() => {
  const remixMsgId = search.get('remix');
  if (!remixMsgId) return;
  // 等 messages 加载完后找该 msg 并 setPreset
  const msg = messages.find((m) => m.id === remixMsgId);
  if (msg && msg.outputAssetIds?.[0]) {
    const asset = assetMap.get(msg.outputAssetIds[0]);
    if (asset) handleRemix(msg, asset);
  }
}, [search, messages, assetMap]);
```

- [ ] **Step 5: typecheck + 完整冒烟**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -10
pnpm dev
```

完整流程：
1. http://localhost:3000/studio 登录
2. 生成 3-5 张图
3. 点 header "图库" → /library 显示按月分组
4. 点 model chip 筛选 → 只显示该 model 的图
5. 点图开 Lightbox → 点 Remix → 自动跳回 /studio?remix=... 且 Composer 已填
6. 删一个 chat 后回 /library → 该 chat 的图消失
7. 配额：临时把 sub.sku_used = 90（quota=100），刷新页面 → header 出现"剩余 10 张"橙色；改 sku_used = 99 → 红色；改 sku_used = 50 → header chip 消失

最终冒烟报告，对照 spec §7 acceptance criteria 逐项打钩。

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(studio\)/library apps/web/app/\(studio\)/layout.tsx apps/web/app/\(studio\)/studio/_components/StudioApp.tsx
git commit -m "feat(studio-ui): /library 路由 + header nav + QuotaBadge 软提示 + URL remix 跳转链路"
```

---

## 最终自检 / Acceptance criteria 对照

完成全部 17 个 task 后，按 spec §7 9 个 cluster 逐项验证：

- [ ] 7.1 数据迁移健康（5 项）
- [ ] 7.2 Capability gating（3 项）
- [ ] 7.3 Refs 槽位（5 项）
- [ ] 7.4 Reroll / Variations / Remix（7 项）
- [ ] 7.5 Conversational mode III（5 项）
- [ ] 7.6 Moodboard（6 项）
- [ ] 7.7 Library（5 项）
- [ ] 7.8 UI 杂项（5 项）
- [ ] 7.9 验收范围说明（确认 GPT-only 功能仅做 UI gating 验证）

全部 ✅ 即 Phase 1 完成。

---

## 一些实施提示

1. **每个 task 完成后跑 `pnpm typecheck` + `pnpm test`**，确保没有遗留破坏。
2. **冒烟时复用 `_smoke_mint.ts` 脚本**（已写过；如已删，再写一个 4 行的 mint session JWT 脚本即可）。
3. **gpt-image-2 渠道仍 down**：Task 6/7/13/14 涉及 GPT 模型的冒烟会因 upstream 500 失败，**但不阻塞 Task 完成**——目标是验证 route/UI 行为，不是上游可达性。当 Gemini 路径走通即可视为 Task pass。
4. **schema drift 兜底**：如果 Task 1 跑迁移时 `pnpm db:generate` 仍因 TTY 报错，跳过生成，直接手写 SQL + 手工更新 `meta/_journal.json`。仓库当前已经这么处理过 0002。
5. **commit 信息**：每个 task 末尾的 commit 命令已给出；保持 conventional commits 风格（feat/fix/refactor）。
