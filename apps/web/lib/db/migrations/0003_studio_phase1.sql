-- Studio Phase 1 schema:
--   • members hot-patch made official (invited_at column + joined_at nullable)
--   • image_messages: drop ref_asset_ids[], add refs jsonb + parent_message_id
--   • new moodboards table (saved prompt presets)

-- ─── 1) members drift fix (hot-patch 正式落) ─────────────────────
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "invited_at" timestamp NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "joined_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "joined_at" DROP DEFAULT;--> statement-breakpoint
-- 索引名对齐（旧版本叫 uniq_members_workspace_user → uniq_member_workspace_user）
ALTER INDEX IF EXISTS "uniq_members_workspace_user" RENAME TO "uniq_member_workspace_user";--> statement-breakpoint

-- ─── 2) image_messages: drop ref_asset_ids, add refs jsonb + parent_message_id ──
ALTER TABLE "image_messages" DROP COLUMN IF EXISTS "ref_asset_ids";--> statement-breakpoint
ALTER TABLE "image_messages" ADD COLUMN "refs" jsonb;--> statement-breakpoint
ALTER TABLE "image_messages" ADD COLUMN "parent_message_id" uuid;--> statement-breakpoint
ALTER TABLE "image_messages" ADD CONSTRAINT "image_messages_parent_fk"
  FOREIGN KEY ("parent_message_id") REFERENCES "image_messages"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_image_messages_parent" ON "image_messages" ("parent_message_id") WHERE "parent_message_id" IS NOT NULL;--> statement-breakpoint

-- ─── 3) moodboards 表 ─────────────────────────────────────────────
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
