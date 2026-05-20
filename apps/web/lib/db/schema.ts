/**
 * ListPack Studio - Drizzle schema
 *
 * Mirrors `docs/prd/01-system-design.md § 3`.
 * All ids are UUID v7 (time-sortable, index-friendly, generated app-side).
 * Multi-tenant boundary = workspace_id on every business row.
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
// Developer API (v3) is metered independently and does NOT occupy plan.

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

export const assetTypeEnum = pgEnum('asset_type', [
  'source_photo',
  'output',
  'intermediate',
  'brand_reference',
]);

export const listingPackStatusEnum = pgEnum('listing_pack_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'partial',
]);

export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'pending',
  'planning',
  'running',
  'paused',
  'awaiting_user',
  'completed',
  'failed',
  'canceled',
]);

export const agentStepStatusEnum = pgEnum('agent_step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const complianceSeverityEnum = pgEnum('compliance_severity', [
  'block',
  'warn',
  'info',
]);

export const complianceOverallEnum = pgEnum('compliance_overall', [
  'pass',
  'warn',
  'fail',
]);

export const platformEnum = pgEnum('platform', [
  'amazon',
  'shopify',
  'ebay',
  'temu',
  'shein',
  'global', // for cross-platform / category-only / law-level rules
]);

export const usageEventEnum = pgEnum('usage_event', [
  'sku_generated',
  'api_call',
  'overage_warning',
  'overage_charged',
]);

export const platformRuleTypeEnum = pgEnum('platform_rule_type', [
  'image_property',
  'text_content',
  'category_specific',
]);

const newId = () => uuidv7();

// ─── CORE: USER / WORKSPACE / MEMBER ─────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at'),
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
    parentWorkspaceId: uuid('parent_workspace_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    byOwner: index('idx_workspaces_owner').on(t.ownerUserId),
    byParent: index('idx_workspaces_parent').on(t.parentWorkspaceId),
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
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqWorkspaceUser: uniqueIndex('uniq_members_workspace_user').on(
      t.workspaceId,
      t.userId,
    ),
    byUser: index('idx_members_user').on(t.userId),
  }),
);

// ─── BILLING ──────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().$defaultFn(newId),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull().default('free'),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start').notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  skuQuota: integer('sku_quota').notNull().default(5),
  skuUsed: integer('sku_used').notNull().default(0),
  overageEnabled: boolean('overage_enabled').notNull().default(false),
  overageCapPct: integer('overage_cap_pct').notNull().default(50),
  // Stripe linkage (kept here, not on workspace, to allow non-Stripe billing later)
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
    listingPackId: uuid('listing_pack_id'),
    agentRunId: uuid('agent_run_id'),
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

// ─── PLATFORM CONNECTIONS (Shopify/Amazon OAuth) ─────────────────────

export const platformConnections = pgTable(
  'platform_connections',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    externalAccountId: varchar('external_account_id', { length: 255 }).notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    scopes: text('scopes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqWorkspacePlatformAccount: uniqueIndex(
      'uniq_platform_connection_account',
    ).on(t.workspaceId, t.platform, t.externalAccountId),
  }),
);

// ─── ASSETS / LISTING PACKS / OUTPUTS ────────────────────────────────

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

export const listingPacks = pgTable(
  'listing_packs',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    sourceAssetId: uuid('source_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    targetPlatforms: text('target_platforms').array().notNull(),
    category: varchar('category', { length: 50 }),
    status: listingPackStatusEnum('status').notNull().default('queued'),
    skuCount: integer('sku_count').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => ({
    byWorkspaceCreated: index('idx_listing_packs_workspace_created').on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);

export const outputs = pgTable(
  'outputs',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    listingPackId: uuid('listing_pack_id')
      .notNull()
      .references(() => listingPacks.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    platform: platformEnum('platform').notNull(),
    slot: varchar('slot', { length: 50 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    byPack: index('idx_outputs_pack').on(t.listingPackId),
  }),
);

// ─── AGENT RUNS ──────────────────────────────────────────────────────

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    listingPackId: uuid('listing_pack_id')
      .notNull()
      .references(() => listingPacks.id, { onDelete: 'cascade' }),
    status: agentRunStatusEnum('status').notNull().default('pending'),
    currentStep: varchar('current_step', { length: 50 }),
    plan: jsonb('plan'),
    state: jsonb('state'),
    costCapUsd: numeric('cost_cap_usd', { precision: 10, scale: 4 }),
    costSpentUsd: numeric('cost_spent_usd', { precision: 10, scale: 4 })
      .notNull()
      .default('0'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    error: jsonb('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    byPack: index('idx_agent_runs_pack').on(t.listingPackId),
    byStatusCreated: index('idx_agent_runs_status_created').on(
      t.status,
      t.createdAt,
    ),
  }),
);

export const agentSteps = pgTable(
  'agent_steps',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    agentRunId: uuid('agent_run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    stepName: varchar('step_name', { length: 50 }).notNull(),
    executorName: varchar('executor_name', { length: 50 }),
    status: agentStepStatusEnum('status').notNull().default('pending'),
    inputs: jsonb('inputs'),
    outputs: jsonb('outputs'),
    error: jsonb('error'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
  },
  (t) => ({
    byRun: index('idx_agent_steps_run').on(t.agentRunId, t.startedAt),
  }),
);

// ─── BRAND KIT (one per workspace v1) ───────────────────────────────

export const brandKits = pgTable(
  'brand_kits',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    workspaceId: uuid('workspace_id')
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull().default('Default'),
    logoAssetId: uuid('logo_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    primaryColor: varchar('primary_color', { length: 7 }),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    accentColor: varchar('accent_color', { length: 7 }),
    fontFamily: varchar('font_family', { length: 100 }),
    tagline: varchar('tagline', { length: 200 }),
    /** Free-form additional fields (e.g. brand voice notes, banned words). */
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
);

// ─── COMPLIANCE ──────────────────────────────────────────────────────

export const complianceReports = pgTable(
  'compliance_reports',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    targetPlatform: platformEnum('target_platform').notNull(),
    targetCategory: varchar('target_category', { length: 50 }),
    overall: complianceOverallEnum('overall').notNull(),
    ruleResults: jsonb('rule_results').notNull(),
    fixSuggestions: jsonb('fix_suggestions'),
    ruleSetVersion: integer('rule_set_version').notNull(),
    ranAt: timestamp('ran_at').notNull().defaultNow(),
  },
  (t) => ({
    byAsset: index('idx_compliance_asset').on(t.assetId),
  }),
);

// ─── RULE LIBRARY (catalog, system-managed) ─────────────────────────

export const platformRules = pgTable(
  'platform_rules',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    ruleKey: varchar('rule_key', { length: 200 }).notNull(),
    platform: platformEnum('platform').notNull(),
    appliesToSlot: varchar('applies_to_slot', { length: 50 })
      .notNull()
      .default('any'),
    appliesToCategory: text('applies_to_category').array(),
    ruleType: platformRuleTypeEnum('rule_type').notNull(),
    spec: jsonb('spec').notNull(),
    severity: complianceSeverityEnum('severity').notNull().default('warn'),
    autoFix: jsonb('auto_fix'),
    displayTitle: jsonb('display_title').notNull(),
    displayMessage: jsonb('display_message').notNull(),
    fixCta: jsonb('fix_cta'),
    version: integer('version').notNull().default(1),
    effectiveFrom: timestamp('effective_from').notNull().defaultNow(),
    supersededAt: timestamp('superseded_at'),
    sourceUrl: text('source_url'),
    sourceType: varchar('source_type', { length: 50 }),
    lastVerifiedAt: timestamp('last_verified_at'),
  },
  (t) => ({
    byKeyVersion: uniqueIndex('uniq_platform_rule_key_version').on(
      t.ruleKey,
      t.version,
    ),
    byPlatformSlot: index('idx_platform_rules_lookup').on(
      t.platform,
      t.appliesToSlot,
      t.supersededAt,
    ),
  }),
);

export const criticCards = pgTable(
  'critic_cards',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    cardId: varchar('card_id', { length: 100 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    scope: text('scope').array().notNull(),
    dimensions: jsonb('dimensions').notNull(),
    acceptThreshold: numeric('accept_threshold', {
      precision: 3,
      scale: 1,
    }).notNull(),
    abortConditions: jsonb('abort_conditions'),
    vlmPromptTemplate: text('vlm_prompt_template').notNull(),
    version: integer('version').notNull().default(1),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => ({
    byCardVersion: uniqueIndex('uniq_critic_card_version').on(
      t.cardId,
      t.version,
    ),
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
  listingPacks: many(listingPacks),
  platformConnections: many(platformConnections),
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

export const assetsRelations = relations(assets, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [assets.workspaceId],
    references: [workspaces.id],
  }),
  uploader: one(users, {
    fields: [assets.uploaderUserId],
    references: [users.id],
  }),
  complianceReports: many(complianceReports),
}));

export const listingPacksRelations = relations(
  listingPacks,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [listingPacks.workspaceId],
      references: [workspaces.id],
    }),
    sourceAsset: one(assets, {
      fields: [listingPacks.sourceAssetId],
      references: [assets.id],
    }),
    outputs: many(outputs),
    agentRuns: many(agentRuns),
  }),
);

export const outputsRelations = relations(outputs, ({ one }) => ({
  listingPack: one(listingPacks, {
    fields: [outputs.listingPackId],
    references: [listingPacks.id],
  }),
  asset: one(assets, { fields: [outputs.assetId], references: [assets.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  listingPack: one(listingPacks, {
    fields: [agentRuns.listingPackId],
    references: [listingPacks.id],
  }),
  steps: many(agentSteps),
}));

export const agentStepsRelations = relations(agentSteps, ({ one }) => ({
  agentRun: one(agentRuns, {
    fields: [agentSteps.agentRunId],
    references: [agentRuns.id],
  }),
}));

export const complianceReportsRelations = relations(
  complianceReports,
  ({ one }) => ({
    asset: one(assets, {
      fields: [complianceReports.assetId],
      references: [assets.id],
    }),
  }),
);

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
// PG enum value unions — keep in sync with PLAN_CATALOG in lib/payments/plans.ts.
export type Plan = (typeof planEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type PlatformConnection = typeof platformConnections.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ListingPack = typeof listingPacks.$inferSelect;
export type NewListingPack = typeof listingPacks.$inferInsert;
export type Output = typeof outputs.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentStep = typeof agentSteps.$inferSelect;
export type ComplianceReport = typeof complianceReports.$inferSelect;
export type PlatformRule = typeof platformRules.$inferSelect;
export type CriticCard = typeof criticCards.$inferSelect;
export type BrandKit = typeof brandKits.$inferSelect;
export type NewBrandKit = typeof brandKits.$inferInsert;
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
  CREATE_LISTING_PACK = 'CREATE_LISTING_PACK',
  PUBLISH_TO_PLATFORM = 'PUBLISH_TO_PLATFORM',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  UPDATE_OVERAGE_SETTING = 'UPDATE_OVERAGE_SETTING',
}

export { sql };
