import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  numeric,
  primaryKey,
  index,
  uniqueIndex,
  pgSequence
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────
// Enums (Plan Técnico MVP v2 §4 y §5)
// ─────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["BUYER", "ARTIST", "ADMIN"]);
export const commissionStatusEnum = pgEnum("commission_status", ["OPEN", "WAITLIST", "CLOSED"]);
export const watermarkModeEnum = pgEnum("watermark_mode", ["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"]);
export const paymentPlanEnum = pgEnum("payment_plan", [
  "FULL_100",
  "SPLIT_ON_SKETCH",
  "SPLIT_ON_FINAL_PREVIEW"
]);
export const contentRatingEnum = pgEnum("content_rating", ["SFW", "SUGGESTIVE", "NSFW"]);
export const orderStatusEnum = pgEnum("order_status", [
  "REQUESTED",
  "REJECTED",
  "ACCEPTED_WAITING_DEPOSIT",
  "EXPIRED",
  "IN_PROGRESS_SKETCH",
  "SKETCH_REVIEW",
  "WAITING_PAYMENT_AFTER_SKETCH",
  "WORKING_FINAL",
  "FINAL_PREVIEW_REVIEW",
  "WAITING_PAYMENT_BEFORE_HD",
  "COMPLETED_HD_UNLOCKED",
  "CANCELLED"
]);
export const currencyEnum = pgEnum("currency", ["ARS", "USD"]);
export const paymentProviderEnum = pgEnum("payment_provider", ["MERCADOPAGO", "ASTROPAY"]);
export const milestoneStageEnum = pgEnum("milestone_stage", ["FULL_100", "DEPOSIT_50", "FINAL_50"]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REFUNDED",
  "CHARGED_BACK"
]);
export const messageTypeEnum = pgEnum("message_type", [
  "TEXT",
  "SKETCH_SUBMISSION",
  "FINAL_PREVIEW_SUBMISSION",
  "SYSTEM_EVENT"
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// ─────────────────────────────────────────────────────────────
// Better Auth (user / session / account / verification)
// Los nombres de propiedad son los que espera Better Auth.
// ─────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // Nombre visible / artístico
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"), // URL pública del avatar
  username: text("username").unique(), // plugin username de Better Auth
  displayUsername: text("display_username"),
  role: userRoleEnum("role").default("BUYER").notNull(),
  showNsfw: boolean("show_nsfw").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("accounts_user_idx").on(t.userId)]
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)]
);

// ─────────────────────────────────────────────────────────────
// ARTIST_PROFILE
// ─────────────────────────────────────────────────────────────
export const artistProfiles = pgTable("artist_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio"),
  bannerUrl: text("banner_url"),
  commissionStatus: commissionStatusEnum("commission_status").default("CLOSED").notNull(),
  defaultWatermarkMode: watermarkModeEnum("default_watermark_mode").default("AUTO_TEXT").notNull(),
  watermarkCustomText: text("watermark_custom_text"),
  termsOfService: text("terms_of_service"),
  isVerifiedHuman: boolean("is_verified_human").default(false).notNull(),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().default({}).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

// ─────────────────────────────────────────────────────────────
// PAYMENT_ACCOUNT (tokens OAuth cifrados con AES-256-GCM)
// ─────────────────────────────────────────────────────────────
export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    publicKey: text("public_key"),
    liveMode: boolean("live_mode").default(false).notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex("payment_accounts_artist_provider_uq").on(t.artistId, t.provider),
    index("payment_accounts_provider_user_idx").on(t.provider, t.providerUserId)
  ]
);

// ─────────────────────────────────────────────────────────────
// TAG + relaciones N:M
// ─────────────────────────────────────────────────────────────
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt()
});

// ─────────────────────────────────────────────────────────────
// PORTFOLIO_ITEM
// ─────────────────────────────────────────────────────────────
export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),
    imageKey: text("image_key"), // key en R2 (bucket público) para poder borrarla
    rating: contentRatingEnum("rating").default("SFW").notNull(),
    wipProofUrl: text("wip_proof_url"),
    createdAt: createdAt()
  },
  (t) => [index("portfolio_items_artist_idx").on(t.artistId)]
);

export const portfolioItemTags = pgTable(
  "portfolio_item_tags",
  {
    portfolioItemId: uuid("portfolio_item_id")
      .notNull()
      .references(() => portfolioItems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" })
  },
  (t) => [primaryKey({ columns: [t.portfolioItemId, t.tagId] })]
);

// ─────────────────────────────────────────────────────────────
// COMMISSION_SERVICE + COMMISSION_ADDON
// ─────────────────────────────────────────────────────────────
export const commissionServices = pgTable(
  "commission_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceArs: integer("price_ars").notNull(),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
    paymentPlan: paymentPlanEnum("payment_plan").default("SPLIT_ON_SKETCH").notNull(),
    turnaroundDays: integer("turnaround_days").default(14).notNull(),
    maxSlots: integer("max_slots").default(3).notNull(),
    revisionsIncluded: integer("revisions_included").default(2).notNull(),
    rating: contentRatingEnum("rating").default("SFW").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("commission_services_artist_idx").on(t.artistId)]
);

export const commissionAddons = pgTable(
  "commission_addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => commissionServices.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceArs: integer("price_ars").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt()
  },
  (t) => [index("commission_addons_service_idx").on(t.serviceId)]
);

export const commissionServiceTags = pgTable(
  "commission_service_tags",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => commissionServices.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" })
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.tagId] })]
);

// ─────────────────────────────────────────────────────────────
// COMMISSION_ORDER
// ─────────────────────────────────────────────────────────────
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1000, increment: 1 });

export type AddonSnapshot = { id: string; name: string; priceArs: number };

export const commissionOrders = pgTable(
  "commission_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(), // Ej: PST-1042
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => commissionServices.id),
    status: orderStatusEnum("status").default("REQUESTED").notNull(),
    paymentPlanSnapshot: paymentPlanEnum("payment_plan_snapshot").notNull(),
    termsSnapshot: text("terms_snapshot").notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    serviceSnapshot: jsonb("service_snapshot")
      .$type<{
        title: string;
        priceArs: number;
        turnaroundDays: number;
        revisionsIncluded: number;
        rating: "SFW" | "SUGGESTIVE" | "NSFW";
      }>()
      .notNull(),
    addonsSnapshot: jsonb("addons_snapshot").$type<AddonSnapshot[]>().default([]).notNull(),
    currency: currencyEnum("currency").default("ARS").notNull(),
    totalAmount: integer("total_amount").notNull(),
    platformFeeAmount: integer("platform_fee_amount").notNull(),
    depositAmount: integer("deposit_amount").notNull(),
    finalAmount: integer("final_amount").notNull(),
    buyerBrief: text("buyer_brief").notNull(),
    referenceImages: jsonb("reference_images").$type<string[]>().default([]).notNull(), // keys privadas en R2
    externalBoardUrl: text("external_board_url"),
    sketchWatermarkedKey: text("sketch_watermarked_key"),
    previewWatermarkedKey: text("preview_watermarked_key"),
    finalHdPrivateKey: text("final_hd_private_key"),
    finalHdFilename: text("final_hd_filename"),
    revisionsUsed: integer("revisions_used").default(0).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("commission_orders_buyer_idx").on(t.buyerId),
    index("commission_orders_artist_idx").on(t.artistId),
    index("commission_orders_service_status_idx").on(t.serviceId, t.status)
  ]
);

// ─────────────────────────────────────────────────────────────
// ORDER_MILESTONE_PAYMENT
// ─────────────────────────────────────────────────────────────
export const orderMilestonePayments = pgTable(
  "order_milestone_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => commissionOrders.id, { onDelete: "cascade" }),
    stage: milestoneStageEnum("stage").notNull(),
    provider: paymentProviderEnum("provider").default("MERCADOPAGO").notNull(),
    grossAmount: integer("gross_amount").notNull(),
    marketplaceFee: integer("marketplace_fee").notNull(),
    mpPreferenceId: text("mp_preference_id"),
    mpPaymentId: text("mp_payment_id").unique(),
    checkoutUrl: text("checkout_url"),
    status: milestoneStatusEnum("status").default("PENDING").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [uniqueIndex("order_milestone_payments_order_stage_uq").on(t.orderId, t.stage)]
);

// ─────────────────────────────────────────────────────────────
// ORDER_MESSAGE
// ─────────────────────────────────────────────────────────────
export const orderMessages = pgTable(
  "order_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => commissionOrders.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id), // null = sistema
    type: messageTypeEnum("type").default("TEXT").notNull(),
    content: text("content").notNull(),
    attachments: jsonb("attachments").$type<string[]>().default([]).notNull(), // keys privadas
    createdAt: createdAt()
  },
  (t) => [index("order_messages_order_idx").on(t.orderId, t.createdAt)]
);

// ─────────────────────────────────────────────────────────────
// REVIEW
// ─────────────────────────────────────────────────────────────
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => commissionOrders.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: createdAt()
  },
  (t) => [index("reviews_artist_idx").on(t.artistId)]
);

// ─────────────────────────────────────────────────────────────
// Idempotencia de webhooks de Mercado Pago
// ─────────────────────────────────────────────────────────────
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // `${provider}:${topic}:${resourceId}:${status}`
  provider: paymentProviderEnum("provider").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt()
});
