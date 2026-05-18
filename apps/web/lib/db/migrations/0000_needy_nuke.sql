CREATE TYPE "public"."agent_run_status" AS ENUM('pending', 'planning', 'running', 'paused', 'awaiting_user', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."agent_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('source_photo', 'output', 'intermediate', 'brand_reference');--> statement-breakpoint
CREATE TYPE "public"."compliance_overall" AS ENUM('pass', 'warn', 'fail');--> statement-breakpoint
CREATE TYPE "public"."compliance_severity" AS ENUM('block', 'warn', 'info');--> statement-breakpoint
CREATE TYPE "public"."listing_pack_status" AS ENUM('queued', 'running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'brand', 'agency', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('amazon', 'shopify', 'ebay', 'temu', 'shein', 'global');--> statement-breakpoint
CREATE TYPE "public"."platform_rule_type" AS ENUM('image_property', 'text_content', 'category_specific');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'paused', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."usage_event" AS ENUM('sku_generated', 'api_call', 'overage_warning', 'overage_charged');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"ip_address" varchar(45),
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_pack_id" uuid NOT NULL,
	"status" "agent_run_status" DEFAULT 'pending' NOT NULL,
	"current_step" varchar(50),
	"plan" jsonb,
	"state" jsonb,
	"cost_cap_usd" numeric(10, 4),
	"cost_spent_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"error" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"step_name" varchar(50) NOT NULL,
	"executor_name" varchar(50),
	"status" "agent_step_status" DEFAULT 'pending' NOT NULL,
	"inputs" jsonb,
	"outputs" jsonb,
	"error" jsonb,
	"started_at" timestamp,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploader_user_id" uuid,
	"type" "asset_type" NOT NULL,
	"storage_key" text NOT NULL,
	"cdn_url" text,
	"mime" varchar(100) NOT NULL,
	"width" integer,
	"height" integer,
	"file_size" bigint,
	"hash" varchar(64),
	"category" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "compliance_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"target_platform" "platform" NOT NULL,
	"target_category" varchar(50),
	"overall" "compliance_overall" NOT NULL,
	"rule_results" jsonb NOT NULL,
	"fix_suggestions" jsonb,
	"rule_set_version" integer NOT NULL,
	"ran_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "critic_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"scope" text[] NOT NULL,
	"dimensions" jsonb NOT NULL,
	"accept_threshold" numeric(3, 1) NOT NULL,
	"abort_conditions" jsonb,
	"vlm_prompt_template" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"workspace_id" uuid
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"target_platforms" text[] NOT NULL,
	"category" varchar(50),
	"status" "listing_pack_status" DEFAULT 'queued' NOT NULL,
	"sku_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outputs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_pack_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"slot" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_account_id" varchar(255) NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp,
	"scopes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_key" varchar(200) NOT NULL,
	"platform" "platform" NOT NULL,
	"applies_to_slot" varchar(50) DEFAULT 'any' NOT NULL,
	"applies_to_category" text[],
	"rule_type" "platform_rule_type" NOT NULL,
	"spec" jsonb NOT NULL,
	"severity" "compliance_severity" DEFAULT 'warn' NOT NULL,
	"auto_fix" jsonb,
	"display_title" jsonb NOT NULL,
	"display_message" jsonb NOT NULL,
	"fix_cta" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp,
	"source_url" text,
	"source_type" varchar(50),
	"last_verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp DEFAULT now() NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"sku_quota" integer DEFAULT 5 NOT NULL,
	"sku_used" integer DEFAULT 0 NOT NULL,
	"overage_enabled" boolean DEFAULT false NOT NULL,
	"overage_cap_pct" integer DEFAULT 50 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_product_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event" "usage_event" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cost_usd" numeric(10, 4),
	"listing_pack_id" uuid,
	"agent_run_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(100),
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"plan_id" "plan" DEFAULT 'free' NOT NULL,
	"parent_workspace_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_listing_pack_id_listing_packs_id_fk" FOREIGN KEY ("listing_pack_id") REFERENCES "public"."listing_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reports" ADD CONSTRAINT "compliance_reports_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critic_cards" ADD CONSTRAINT "critic_cards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_packs" ADD CONSTRAINT "listing_packs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_packs" ADD CONSTRAINT "listing_packs_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outputs" ADD CONSTRAINT "outputs_listing_pack_id_listing_packs_id_fk" FOREIGN KEY ("listing_pack_id") REFERENCES "public"."listing_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outputs" ADD CONSTRAINT "outputs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_workspace_timestamp" ON "activity_logs" USING btree ("workspace_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_pack" ON "agent_runs" USING btree ("listing_pack_id");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status_created" ON "agent_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_steps_run" ON "agent_steps" USING btree ("agent_run_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_assets_hash" ON "assets" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "idx_assets_workspace_created" ON "assets" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_compliance_asset" ON "compliance_reports" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_critic_card_version" ON "critic_cards" USING btree ("card_id","version");--> statement-breakpoint
CREATE INDEX "idx_listing_packs_workspace_created" ON "listing_packs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_members_workspace_user" ON "members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_members_user" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_outputs_pack" ON "outputs" USING btree ("listing_pack_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_platform_connection_account" ON "platform_connections" USING btree ("workspace_id","platform","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_platform_rule_key_version" ON "platform_rules" USING btree ("rule_key","version");--> statement-breakpoint
CREATE INDEX "idx_platform_rules_lookup" ON "platform_rules" USING btree ("platform","applies_to_slot","superseded_at");--> statement-breakpoint
CREATE INDEX "idx_usage_workspace_created" ON "usage_records" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_workspaces_owner" ON "workspaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_workspaces_parent" ON "workspaces" USING btree ("parent_workspace_id");