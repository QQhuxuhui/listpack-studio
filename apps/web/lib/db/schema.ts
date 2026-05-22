/**
 * ListPack Studio - Drizzle schema
 *
 * Multi-tenant boundary = workspace_id on every business row.
 * IDs: UUID v7 (time-sortable, index-friendly, generated app-side).
 *
 * Domain: a chat-based AI image studio. Each `image_chat` is a thread
 * of `image_messages`; an assistant message resolves to one or more
 * generated `assets` (referenced via uuid[] columns; FK enforced by
 * application logic — Postgres can't FK array elements).
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

// ─── ENUMS ────────────────────────────────────────────────────────────

export const planEnum = pgEnum('plan', [
  'free',
  'starter',
  'pro',
  'brand',
  'agency',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'paused',
  'unpaid',
]);

export const memberRoleEnum = pgEnum('member_role', [
  'owner',
  'admin',
  'editor',
  'viewer',
]);

/**
 * Old values kept for backward-compat with surviving rows from the
 * legacy listing-pack flow. New rows only use 'user_upload' and
 * 'generated'.
 */
export const assetTypeEnum = pgEnum('asset_type', [
  'source_photo',
  'output',
  'intermediate',
  'brand_reference',
  'user_upload',
  'generated',
]);

export const usageEventEnum = pgEnum('usage_event', [
  'sku_generated', // legacy — never emitted again
  'image_generated',
  'api_call',
  'overage_warning',
  'overage_charged',
]);

export const imageMessageRoleEnum = pgEnum('image_message_role', [
  'user',
  'assistant',
]);

export const imageMessageStatusEnum = pgEnum('image_message_status', [
  'pending',
  'generating',
  'completed',
  'failed',
]);

const newId = () => uuidv7();

// ─── CORE: USER / WORKSPACE / MEMBER ─────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    planId: planEnum('plan_id').notNull().default('free'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    bySlug: uniqueIndex('idx_workspaces_slug').on(t.slug),
  }),
);

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('editor'),
    invitedAt: timestamp('invited_at').notNull().defaultNow(),
    joinedAt: timestamp('joined_at'),
  },
  (t) => ({
    uniqWorkspaceUser: uniqueIndex('uniq_member_workspace_user').on(
      t.workspaceId,
      t.userId,
    ),
  }),
);

// ─── BILLING ────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull(),
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  /** Renamed semantically: now means "images per period". Column kept
      as `sku_quota` for migration ease; UI copy is 图片配额. */
  skuQuota: integer('sku_quota').notNull().default(0),
  skuUsed: integer('sku_used').notNull().default(0),
  overageEnabled: boolean('overage_enabled').notNull().default(false),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    event: usageEventEnum('event').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitCostUsd: numeric('unit_cost_usd', { precision: 10, scale: 4 }),
    /** Free-form: { messageId, chatId, model, ... } for traceability. */
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    byWorkspaceCreated: index('idx_usage_workspace_created').on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);

// ─── ASSETS (file storage; generic — used both for user uploads
//     and for AI-generated images) ─────────────────────────────────

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    uploaderUserId: uuid('uploader_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    type: assetTypeEnum('type').notNull(),
    storageKey: text('storage_key').notNull(),
    cdnUrl: text('cdn_url'),
    mime: varchar('mime', { length: 100 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    fileSize: bigint('file_size', { mode: 'number' }),
    hash: varchar('hash', { length: 64 }),
    category: varchar('category', { length: 50 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    byHash: index('idx_assets_hash').on(t.hash),
    byWorkspaceCreated: index('idx_assets_workspace_created').on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);

// ─── IMAGE STUDIO: CHATS + MESSAGES ──────────────────────────────────

export const imageChats = pgTable(
  'image_chats',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull().default('新对话'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    byWorkspaceUpdated: index('idx_image_chats_workspace_updated').on(
      t.workspaceId,
      t.updatedAt,
    ),
  }),
);

/**
 * A user message holds the prompt + reference assets; an assistant
 * message holds the model/params used and the resulting asset ids.
 *
 * refAssetIds / outputAssetIds are uuid arrays referencing `assets.id`.
 * Postgres can't enforce FK on array elements, so application code
 * (server-side only) is responsible for never inserting bogus ids.
 */
export const imageMessages = pgTable(
  'image_messages',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => imageChats.id, { onDelete: 'cascade' }),
    role: imageMessageRoleEnum('role').notNull(),
    text: text('text'),
    model: varchar('model', { length: 100 }),
    /** Free-form params: { n, size, aspectRatio, quality, background, ... } */
    params: jsonb('params'),
    refAssetIds: uuid('ref_asset_ids').array(),
    outputAssetIds: uuid('output_asset_ids').array(),
    status: imageMessageStatusEnum('status').notNull().default('pending'),
    error: jsonb('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => ({
    byChat: index('idx_image_messages_chat_created').on(t.chatId, t.createdAt),
  }),
);

// ─── AUDIT / INVITATIONS ────────────────────────────────────────────

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 100 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    metadata: jsonb('metadata'),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (t) => ({
    byWorkspaceTimestamp: index('idx_activity_workspace_timestamp').on(
      t.workspaceId,
      t.timestamp,
    ),
  }),
);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: memberRoleEnum('role').notNull().default('editor'),
  invitedByUserId: uuid('invited_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

// ─── RELATIONS ──────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  members: many(members),
  ownedWorkspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerUserId],
    references: [users.id],
  }),
  members: many(members),
  subscription: one(subscriptions, {
    fields: [workspaces.id],
    references: [subscriptions.workspaceId],
  }),
  assets: many(assets),
  imageChats: many(imageChats),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const membersRelations = relations(members, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [members.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [subscriptions.workspaceId],
    references: [workspaces.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [assets.workspaceId],
    references: [workspaces.id],
  }),
  uploader: one(users, {
    fields: [assets.uploaderUserId],
    references: [users.id],
  }),
}));

export const imageChatsRelations = relations(imageChats, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [imageChats.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [imageChats.userId],
    references: [users.id],
  }),
  messages: many(imageMessages),
}));

export const imageMessagesRelations = relations(imageMessages, ({ one }) => ({
  chat: one(imageChats, {
    fields: [imageMessages.chatId],
    references: [imageChats.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [activityLogs.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedByUserId],
    references: [users.id],
  }),
}));

// ─── INFERRED TYPES ─────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Plan = (typeof planEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ImageChat = typeof imageChats.$inferSelect;
export type NewImageChat = typeof imageChats.$inferInsert;
export type ImageMessage = typeof imageMessages.$inferSelect;
export type NewImageMessage = typeof imageMessages.$inferInsert;
export type ImageMessageRole = (typeof imageMessageRoleEnum.enumValues)[number];
export type ImageMessageStatus = (typeof imageMessageStatusEnum.enumValues)[number];
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;

export type WorkspaceWithMembers = Workspace & {
  members: (Member & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
  subscription?: Subscription | null;
};

// ─── ACTIVITY TYPES (string enum used by app code) ──────────────────

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_WORKSPACE = 'CREATE_WORKSPACE',
  REMOVE_WORKSPACE_MEMBER = 'REMOVE_WORKSPACE_MEMBER',
  INVITE_WORKSPACE_MEMBER = 'INVITE_WORKSPACE_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
  CREATE_IMAGE_CHAT = 'CREATE_IMAGE_CHAT',
  GENERATE_IMAGE = 'GENERATE_IMAGE',
  UPDATE_OVERAGE_SETTING = 'UPDATE_OVERAGE_SETTING',
}

export { sql };
