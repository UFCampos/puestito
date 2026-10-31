import {
  sqliteTable,
  text,
  integer
} from "drizzle-orm/sqlite-core";

// 1. Users
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // uuid
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role", { enum: ["BUYER", "ARTIST", "ADMIN"] }).default("BUYER").notNull(),
  showNsfw: integer("show_nsfw", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("created_at").notNull()
});

// 2. Artist Profiles
export const artistProfiles = sqliteTable("artist_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  bio: text("bio"),
  bannerUrl: text("banner_url"),
  commissionStatus: text("commission_status", { enum: ["OPEN", "WAITLIST", "CLOSED"] }).default("CLOSED").notNull(),
  defaultWatermarkMode: text("default_watermark_mode", { enum: ["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"] }).default("AUTO_TEXT").notNull(),
  watermarkCustomText: text("watermark_custom_text"),
  termsOfService: text("terms_of_service"),
  isVerifiedHuman: integer("is_verified_human", { mode: "boolean" }).default(false).notNull(),
  socialLinks: text("social_links"), // JSON string
  createdAt: text("created_at").notNull()
});

// 3. Portfolio Items
export const portfolioItems = sqliteTable("portfolio_items", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").references(() => artistProfiles.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(), // WebP optimizado
  rating: text("rating", { enum: ["SFW", "SUGGESTIVE", "NSFW"] }).default("SFW").notNull(),
  tags: text("tags"), // JSON array de tags ej: ["Genshin", "Vocaloid", "Digital"]
  wipProofUrl: text("wip_proof_url"),
  createdAt: text("created_at").notNull()
});

// 4. Payment Accounts (Mercado Pago OAuth)
export const paymentAccounts = sqliteTable("payment_accounts", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").references(() => artistProfiles.id, { onDelete: "cascade" }).notNull(),
  provider: text("provider").notNull(), // MERCADOPAGO, ASTROPAY
  providerUserId: text("provider_user_id").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  tokenExpiresAt: text("token_expires_at"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").notNull()
});

// 5. Commission Services
export const commissionServices = sqliteTable("commission_services", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").references(() => artistProfiles.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priceArs: integer("price_ars").notNull(),
  priceUsd: integer("price_usd"), // opcional
  paymentPlan: text("payment_plan", { enum: ["FULL_100", "SPLIT_ON_SKETCH", "SPLIT_ON_FINAL_PREVIEW"] }).default("SPLIT_ON_SKETCH").notNull(),
  turnaroundDays: integer("turnaround_days").default(14).notNull(),
  maxSlots: integer("max_slots").default(3).notNull(),
  revisionsIncluded: integer("revisions_included").default(2).notNull(),
  rating: text("rating", { enum: ["SFW", "SUGGESTIVE", "NSFW"] }).default("SFW").notNull(),
  tags: text("tags"), // JSON array
  exampleImages: text("example_images"), // JSON array
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").notNull()
});

// 6. Commission Orders
export const commissionOrders = sqliteTable("commission_orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(), // PST-1001
  buyerId: text("buyer_id").references(() => users.id).notNull(),
  artistId: text("artist_id").references(() => artistProfiles.id).notNull(),
  serviceId: text("service_id").references(() => commissionServices.id).notNull(),
  status: text("status", {
    enum: [
      "REQUESTED",
      "ACCEPTED_WAITING_DEPOSIT",
      "IN_PROGRESS_SKETCH",
      "SKETCH_REVIEW",
      "WAITING_PAYMENT_AFTER_SKETCH",
      "WORKING_FINAL",
      "FINAL_PREVIEW_REVIEW",
      "WAITING_PAYMENT_BEFORE_HD",
      "COMPLETED_HD_UNLOCKED",
      "CANCELLED"
    ]
  }).default("REQUESTED").notNull(),
  paymentPlanSnapshot: text("payment_plan_snapshot").notNull(),
  termsSnapshot: text("terms_snapshot").notNull(),
  termsAcceptedAt: text("terms_accepted_at").notNull(),
  currency: text("currency").default("ARS").notNull(),
  totalAmount: integer("total_amount").notNull(),
  platformFeeAmount: integer("platform_fee_amount").notNull(), // 5%
  depositAmount: integer("deposit_amount").notNull(),
  finalAmount: integer("final_amount").notNull(),
  buyerBrief: text("buyer_brief").notNull(),
  referenceImages: text("reference_images"), // JSON array string
  externalBoardUrl: text("external_board_url"),
  sketchWatermarkedUrl: text("sketch_watermarked_url"),
  previewWatermarkedUrl: text("preview_watermarked_url"),
  finalHdPrivateKey: text("final_hd_private_key"),
  createdAt: text("created_at").notNull()
});

// 7. Order Milestone Payments
export const orderMilestonePayments = sqliteTable("order_milestone_payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => commissionOrders.id, { onDelete: "cascade" }).notNull(),
  stage: text("stage", { enum: ["FULL_100", "DEPOSIT_50", "FINAL_50"] }).notNull(),
  provider: text("provider").default("MERCADOPAGO").notNull(),
  grossAmount: integer("gross_amount").notNull(),
  marketplaceFee: integer("marketplace_fee").notNull(),
  mpPreferenceId: text("mp_preference_id"),
  mpPaymentId: text("mp_payment_id"),
  status: text("status", { enum: ["PENDING", "APPROVED", "REFUNDED", "FAILED"] }).default("PENDING").notNull(),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull()
});

// 8. Order Messages (Hilo de mensajes y entregas)
export const orderMessages = sqliteTable("order_messages", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => commissionOrders.id, { onDelete: "cascade" }).notNull(),
  senderId: text("sender_id").references(() => users.id).notNull(),
  type: text("type", { enum: ["TEXT", "SKETCH_SUBMISSION", "FINAL_PREVIEW_SUBMISSION", "SYSTEM_EVENT"] }).default("TEXT").notNull(),
  content: text("content").notNull(),
  attachments: text("attachments"), // JSON array
  createdAt: text("created_at").notNull()
});

// 9. Reviews
export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => commissionOrders.id, { onDelete: "cascade" }).notNull().unique(),
  artistId: text("artist_id").references(() => artistProfiles.id).notNull(),
  buyerId: text("buyer_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(), // 1 to 5
  comment: text("comment"),
  createdAt: text("created_at").notNull()
});
