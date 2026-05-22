-- Studio redesign: drop the cross-border listing-pack stack and add a
-- generic chat-based image-generation schema.
--
-- ─── 1) DROP TABLES (reverse FK order) ────────────────────────────
DROP TABLE IF EXISTS "critic_cards" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_steps" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_runs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "compliance_reports" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "outputs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "listing_packs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "brand_kits" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "platform_connections" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "platform_rules" CASCADE;--> statement-breakpoint

-- ─── 2) Strip dead FK-less columns from usage_records ────────────
ALTER TABLE "usage_records" DROP COLUMN IF EXISTS "listing_pack_id";--> statement-breakpoint
ALTER TABLE "usage_records" DROP COLUMN IF EXISTS "agent_run_id";--> statement-breakpoint

-- ─── 3) Drop dead enums (after their consumers are gone) ─────────
DROP TYPE IF EXISTS "listing_pack_status";--> statement-breakpoint
DROP TYPE IF EXISTS "agent_run_status";--> statement-breakpoint
DROP TYPE IF EXISTS "agent_step_status";--> statement-breakpoint
DROP TYPE IF EXISTS "compliance_severity";--> statement-breakpoint
DROP TYPE IF EXISTS "compliance_overall";--> statement-breakpoint
DROP TYPE IF EXISTS "platform_rule_type";--> statement-breakpoint
DROP TYPE IF EXISTS "platform";--> statement-breakpoint

-- ─── 4) Extend existing enums (PG 12+: ADD VALUE IF NOT EXISTS) ──
-- IMPORTANT: ALTER TYPE ADD VALUE must run outside any transaction
-- block on PG < 12. Drizzle's default migrator runs each migration in
-- one transaction; on PG 12+ the IF NOT EXISTS form is tx-safe.
ALTER TYPE "asset_type" ADD VALUE IF NOT EXISTS 'user_upload';--> statement-breakpoint
ALTER TYPE "asset_type" ADD VALUE IF NOT EXISTS 'generated';--> statement-breakpoint
ALTER TYPE "usage_event" ADD VALUE IF NOT EXISTS 'image_generated';--> statement-breakpoint

-- ─── 5) New enums ────────────────────────────────────────────────
CREATE TYPE "image_message_role" AS ENUM ('user', 'assistant');--> statement-breakpoint
CREATE TYPE "image_message_status" AS ENUM ('pending', 'generating', 'completed', 'failed');--> statement-breakpoint

-- ─── 6) image_chats — one thread per workspace+user ──────────────
CREATE TABLE "image_chats" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" varchar(200) DEFAULT '新对话' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);--> statement-breakpoint
ALTER TABLE "image_chats" ADD CONSTRAINT "image_chats_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_chats" ADD CONSTRAINT "image_chats_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_image_chats_workspace_updated" ON "image_chats" ("workspace_id","updated_at");--> statement-breakpoint

-- ─── 7) image_messages — user prompt or assistant response ───────
-- ref_asset_ids:    uuid[] of input refs (i2i source images)
-- output_asset_ids: uuid[] of generated assets
-- Both reference assets.id but PG can't FK array elements; integrity
-- is enforced by application code (server-side only).
CREATE TABLE "image_messages" (
  "id" uuid PRIMARY KEY NOT NULL,
  "chat_id" uuid NOT NULL,
  "role" "image_message_role" NOT NULL,
  "text" text,
  "model" varchar(100),
  "params" jsonb,
  "ref_asset_ids" uuid[],
  "output_asset_ids" uuid[],
  "status" "image_message_status" DEFAULT 'pending' NOT NULL,
  "error" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);--> statement-breakpoint
ALTER TABLE "image_messages" ADD CONSTRAINT "image_messages_chat_id_image_chats_id_fk"
  FOREIGN KEY ("chat_id") REFERENCES "public"."image_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_image_messages_chat_created" ON "image_messages" ("chat_id","created_at");
