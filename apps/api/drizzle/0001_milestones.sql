ALTER TYPE "public"."message_type" ADD VALUE 'MILESTONE_SUBMISSION';--> statement-breakpoint
ALTER TYPE "public"."milestone_stage" ADD VALUE 'MILESTONE';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'MILESTONE_WAITING_PAYMENT';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'MILESTONE_IN_PROGRESS';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'MILESTONE_REVIEW';--> statement-breakpoint
ALTER TYPE "public"."payment_plan" ADD VALUE 'MILESTONES';--> statement-breakpoint
DROP INDEX "order_milestone_payments_order_stage_uq";--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "milestones_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD COLUMN "current_milestone" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_services" ADD COLUMN "milestones" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_milestone_payments" ADD COLUMN "milestone_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "order_milestone_payments_order_stage_uq" ON "order_milestone_payments" USING btree ("order_id","stage","milestone_index");