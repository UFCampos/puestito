CREATE TYPE "public"."dispute_party" AS ENUM('BUYER', 'ARTIST', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."dispute_reason" AS ENUM('ARTIST_UNRESPONSIVE', 'BUYER_UNRESPONSIVE', 'LATE_DELIVERY', 'NOT_AS_AGREED', 'WANTS_TO_CANCEL', 'PAYMENT_PROBLEM', 'ABUSIVE_BEHAVIOR', 'OTHER', 'PROVIDER_CLAIM', 'ACCOUNT_SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."dispute_resolution" AS ENUM('WITHDRAWN', 'REFUNDED', 'RESUMED_BY_ADMIN', 'CANCELLED_BY_ADMIN', 'COMPLETED_BY_ADMIN', 'CLOSED_BY_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('ILLEGAL_CONTENT', 'MINOR_SAFETY', 'AI_GENERATED', 'STOLEN_ART', 'SCAM_OR_FRAUD', 'HARASSMENT', 'WRONG_RATING', 'SPAM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('ARTIST', 'PORTFOLIO_ITEM', 'SERVICE', 'ORDER', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."support_kind" AS ENUM('CONTACT', 'ARREPENTIMIENTO', 'DATA_REQUEST');--> statement-breakpoint
CREATE TYPE "public"."support_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'DISPUTED';--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"opened_by_id" uuid,
	"opener_role" "dispute_party" NOT NULL,
	"reason" "dispute_reason" NOT NULL,
	"description" text NOT NULL,
	"status_before" "order_status" NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"proposed_refund_payment_ids" jsonb,
	"proposed_at" timestamp with time zone,
	"resolution" "dispute_resolution",
	"resolution_note" text,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"artist_id" uuid,
	"reason" "report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "support_kind" NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"order_number" text,
	"message" text DEFAULT '' NOT NULL,
	"status" "support_status" DEFAULT 'OPEN' NOT NULL,
	"admin_note" text,
	"handled_by_id" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_messages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "reminder_stage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "work_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "buyer_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "artist_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "buyer_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "artist_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "files_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_services" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_services" ADD COLUMN "moderation_reason" text;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "adult_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_order_id_commission_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commission_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_disputes_order_idx" ON "order_disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_disputes_status_idx" ON "order_disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_disputes_one_open_uq" ON "order_disputes" USING btree ("order_id") WHERE "order_disputes"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "support_messages_status_idx" ON "support_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "commission_orders_status_changed_idx" ON "commission_orders" USING btree ("status","status_changed_at");--> statement-breakpoint
-- Los pedidos existentes arrancan sus plazos desde su última actualización, no desde la migración
UPDATE "commission_orders" SET "status_changed_at" = "updated_at";
