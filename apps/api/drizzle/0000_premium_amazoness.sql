CREATE TYPE "public"."commission_status" AS ENUM('OPEN', 'WAITLIST', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('REQUESTED', 'ACCEPTED_WAITING_DEPOSIT', 'IN_PROGRESS_SKETCH', 'SKETCH_REVIEW', 'WAITING_PAYMENT_AFTER_SKETCH', 'WORKING_FINAL', 'FINAL_PREVIEW_REVIEW', 'WAITING_PAYMENT_BEFORE_HD', 'COMPLETED_HD_UNLOCKED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_plan" AS ENUM('FULL_100', 'SPLIT_ON_SKETCH', 'SPLIT_ON_FINAL_PREVIEW');--> statement-breakpoint
CREATE TYPE "public"."content_rating" AS ENUM('SFW', 'SUGGESTIVE', 'NSFW');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('BUYER', 'ARTIST', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."watermark_mode" AS ENUM('MANUAL', 'AUTO_TEXT', 'AUTO_AVATAR');--> statement-breakpoint
CREATE TABLE "artist_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bio" text,
	"banner_url" text,
	"commission_status" "commission_status" DEFAULT 'CLOSED' NOT NULL,
	"default_watermark_mode" "watermark_mode" DEFAULT 'AUTO_TEXT' NOT NULL,
	"watermark_custom_text" varchar(100),
	"terms_of_service" text,
	"is_verified_human" boolean DEFAULT false NOT NULL,
	"social_links" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artist_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "commission_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(20) NOT NULL,
	"buyer_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'REQUESTED' NOT NULL,
	"payment_plan_snapshot" "payment_plan" NOT NULL,
	"terms_snapshot" text NOT NULL,
	"terms_accepted_at" timestamp DEFAULT now() NOT NULL,
	"currency" varchar(10) DEFAULT 'ARS' NOT NULL,
	"total_amount" integer NOT NULL,
	"platform_fee_amount" integer NOT NULL,
	"buyer_brief" text NOT NULL,
	"reference_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_board_url" text,
	"preview_watermarked_url" text,
	"final_hd_private_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commission_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "commission_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text NOT NULL,
	"price_ars" integer NOT NULL,
	"price_usd" numeric(10, 2),
	"payment_plan" "payment_plan" DEFAULT 'SPLIT_ON_SKETCH' NOT NULL,
	"turnaround_days" integer DEFAULT 14 NOT NULL,
	"max_slots" integer DEFAULT 3 NOT NULL,
	"revisions_included" integer DEFAULT 2 NOT NULL,
	"rating" "content_rating" DEFAULT 'SFW' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(100) NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'BUYER' NOT NULL,
	"show_nsfw" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "artist_profiles" ADD CONSTRAINT "artist_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD CONSTRAINT "commission_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD CONSTRAINT "commission_orders_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_orders" ADD CONSTRAINT "commission_orders_service_id_commission_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."commission_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_services" ADD CONSTRAINT "commission_services_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;