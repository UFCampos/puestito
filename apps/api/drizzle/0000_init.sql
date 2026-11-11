CREATE TYPE "public"."commission_status" AS ENUM('OPEN', 'WAITLIST', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."content_rating" AS ENUM('SFW', 'SUGGESTIVE', 'NSFW');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('ARS', 'USD');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'SKETCH_SUBMISSION', 'FINAL_PREVIEW_SUBMISSION', 'SYSTEM_EVENT');--> statement-breakpoint
CREATE TYPE "public"."milestone_stage" AS ENUM('FULL_100', 'DEPOSIT_50', 'FINAL_50');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CHARGED_BACK');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('REQUESTED', 'REJECTED', 'ACCEPTED_WAITING_DEPOSIT', 'EXPIRED', 'IN_PROGRESS_SKETCH', 'SKETCH_REVIEW', 'WAITING_PAYMENT_AFTER_SKETCH', 'WORKING_FINAL', 'FINAL_PREVIEW_REVIEW', 'WAITING_PAYMENT_BEFORE_HD', 'COMPLETED_HD_UNLOCKED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_plan" AS ENUM('FULL_100', 'SPLIT_ON_SKETCH', 'SPLIT_ON_FINAL_PREVIEW');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('MERCADOPAGO', 'ASTROPAY');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('BUYER', 'ARTIST', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."watermark_mode" AS ENUM('MANUAL', 'AUTO_TEXT', 'AUTO_AVATAR');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bio" text,
	"banner_url" text,
	"commission_status" "commission_status" DEFAULT 'CLOSED' NOT NULL,
	"default_watermark_mode" "watermark_mode" DEFAULT 'AUTO_TEXT' NOT NULL,
	"watermark_custom_text" text,
	"terms_of_service" text,
	"is_verified_human" boolean DEFAULT false NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "commission_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_ars" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"buyer_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'REQUESTED' NOT NULL,
	"payment_plan_snapshot" "payment_plan" NOT NULL,
	"terms_snapshot" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"service_snapshot" jsonb NOT NULL,
	"addons_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"total_amount" integer NOT NULL,
	"platform_fee_amount" integer NOT NULL,
	"deposit_amount" integer NOT NULL,
	"final_amount" integer NOT NULL,
	"buyer_brief" text NOT NULL,
	"reference_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_board_url" text,
	"sketch_watermarked_key" text,
	"preview_watermarked_key" text,
	"final_hd_private_key" text,
	"final_hd_filename" text,
	"revisions_used" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "commission_service_tags" (
	"service_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "commission_service_tags_service_id_tag_id_pk" PRIMARY KEY("service_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "commission_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_ars" integer NOT NULL,
	"price_usd" numeric(10, 2),
	"payment_plan" "payment_plan" DEFAULT 'SPLIT_ON_SKETCH' NOT NULL,
	"turnaround_days" integer DEFAULT 14 NOT NULL,
	"max_slots" integer DEFAULT 3 NOT NULL,
	"revisions_included" integer DEFAULT 2 NOT NULL,
	"rating" "content_rating" DEFAULT 'SFW' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sender_id" uuid,
	"type" "message_type" DEFAULT 'TEXT' NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_milestone_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" "milestone_stage" NOT NULL,
	"provider" "payment_provider" DEFAULT 'MERCADOPAGO' NOT NULL,
	"gross_amount" integer NOT NULL,
	"marketplace_fee" integer NOT NULL,
	"mp_preference_id" text,
	"mp_payment_id" text,
	"checkout_url" text,
	"status" "milestone_status" DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_milestone_payments_mp_payment_id_unique" UNIQUE("mp_payment_id")
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"public_key" text,
	"live_mode" boolean DEFAULT false NOT NULL,
	"token_expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_item_tags" (
	"portfolio_item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "portfolio_item_tags_portfolio_item_id_tag_id_pk" PRIMARY KEY("portfolio_item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text NOT NULL,
	"image_key" text,
	"rating" "content_rating" DEFAULT 'SFW' NOT NULL,
	"wip_proof_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"role" "user_role" DEFAULT 'BUYER' NOT NULL,
	"show_nsfw" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profiles" ADD CONSTRAINT "artist_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_addons" ADD CONSTRAINT "commission_addons_service_id_commission_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."commission_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD CONSTRAINT "commission_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD CONSTRAINT "commission_orders_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD CONSTRAINT "commission_orders_service_id_commission_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."commission_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_service_tags" ADD CONSTRAINT "commission_service_tags_service_id_commission_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."commission_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_service_tags" ADD CONSTRAINT "commission_service_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_services" ADD CONSTRAINT "commission_services_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_commission_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commission_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_milestone_payments" ADD CONSTRAINT "order_milestone_payments_order_id_commission_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commission_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item_tags" ADD CONSTRAINT "portfolio_item_tags_portfolio_item_id_portfolio_items_id_fk" FOREIGN KEY ("portfolio_item_id") REFERENCES "public"."portfolio_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item_tags" ADD CONSTRAINT "portfolio_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_commission_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commission_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "commission_addons_service_idx" ON "commission_addons" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "commission_orders_buyer_idx" ON "commission_orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "commission_orders_artist_idx" ON "commission_orders" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "commission_orders_service_status_idx" ON "commission_orders" USING btree ("service_id","status");--> statement-breakpoint
CREATE INDEX "commission_services_artist_idx" ON "commission_services" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "order_messages_order_idx" ON "order_messages" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_milestone_payments_order_stage_uq" ON "order_milestone_payments" USING btree ("order_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_artist_provider_uq" ON "payment_accounts" USING btree ("artist_id","provider");--> statement-breakpoint
CREATE INDEX "payment_accounts_provider_user_idx" ON "payment_accounts" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "portfolio_items_artist_idx" ON "portfolio_items" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "reviews_artist_idx" ON "reviews" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");