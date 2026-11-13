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
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// Enums (Plan Técnico MVP v2 §4 y §5)
// ─────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["BUYER", "ARTIST", "ADMIN"]);
export const commissionStatusEnum = pgEnum("commission_status", ["OPEN", "WAITLIST", "CLOSED"]);
export const watermarkModeEnum = pgEnum("watermark_mode", ["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"]);
export const paymentPlanEnum = pgEnum("payment_plan", [
  "FULL_100",
  "SPLIT_ON_SKETCH",
  "SPLIT_ON_FINAL_PREVIEW",
  // Pago por etapas configurables por el artista (cada etapa se paga antes de empezarla)
  "MILESTONES"
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
  "CANCELLED",
  // Plan MILESTONES: pago de la etapa → trabajo → revisión → siguiente etapa
  "MILESTONE_WAITING_PAYMENT",
  "MILESTONE_IN_PROGRESS",
  "MILESTONE_REVIEW",
  // Reclamo abierto: el pedido queda en pausa hasta que se resuelva
  "DISPUTED"
]);
export const currencyEnum = pgEnum("currency", ["ARS", "USD"]);
export const paymentProviderEnum = pgEnum("payment_provider", ["MERCADOPAGO", "ASTROPAY"]);
export const milestoneStageEnum = pgEnum("milestone_stage", ["FULL_100", "DEPOSIT_50", "FINAL_50", "MILESTONE"]);
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
  "SYSTEM_EVENT",
  "MILESTONE_SUBMISSION"
]);

// ── Reclamos, denuncias y soporte ──
export const disputePartyEnum = pgEnum("dispute_party", ["BUYER", "ARTIST", "SYSTEM"]);
export const disputeReasonEnum = pgEnum("dispute_reason", [
  "ARTIST_UNRESPONSIVE",
  "BUYER_UNRESPONSIVE",
  "LATE_DELIVERY",
  "NOT_AS_AGREED",
  "WANTS_TO_CANCEL",
  "PAYMENT_PROBLEM",
  "ABUSIVE_BEHAVIOR",
  "OTHER",
  // Abiertos por el sistema
  "PROVIDER_CLAIM",
  "ACCOUNT_SUSPENDED"
]);
export const disputeStatusEnum = pgEnum("dispute_status", ["OPEN", "RESOLVED"]);
export const disputeResolutionEnum = pgEnum("dispute_resolution", [
  "WITHDRAWN",
  "REFUNDED",
  "RESUMED_BY_ADMIN",
  "CANCELLED_BY_ADMIN",
  "COMPLETED_BY_ADMIN",
  "CLOSED_BY_PROVIDER"
]);
export const reportTargetEnum = pgEnum("report_target", ["ARTIST", "PORTFOLIO_ITEM", "SERVICE", "ORDER", "REVIEW"]);
export const reportReasonEnum = pgEnum("report_reason", [
  "ILLEGAL_CONTENT",
  "MINOR_SAFETY",
  "AI_GENERATED",
  "STOLEN_ART",
  "SCAM_OR_FRAUD",
  "HARASSMENT",
  "WRONG_RATING",
  "SPAM",
  "OTHER"
]);
export const reportStatusEnum = pgEnum("report_status", ["OPEN", "RESOLVED", "DISMISSED"]);
export const supportKindEnum = pgEnum("support_kind", ["CONTACT", "ARREPENTIMIENTO", "DATA_REQUEST"]);
export const supportStatusEnum = pgEnum("support_status", ["OPEN", "CLOSED"]);

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
  /** Cuándo declaró ser mayor de edad para ver contenido +18 */
  adultConfirmedAt: timestamp("adult_confirmed_at", { withTimezone: true }),
  /** Aceptación de Términos y Privacidad al crear la cuenta (y versión aceptada) */
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion: text("terms_version"),
  /** Moderación: una cuenta suspendida solo puede leer */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  /** Cuenta eliminada a pedido del titular (datos personales anonimizados) */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    /** Oculta por moderación (el artista la sigue viendo en su panel) */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
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
/** Etapa de pago definida por el artista (plan MILESTONES). Los porcentajes suman 100. */
export type ServiceMilestone = { title: string; description: string; percent: number; days: number };
/** Etapa congelada en el pedido, con su monto en pesos ya calculado */
export type OrderMilestone = ServiceMilestone & { amount: number };

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
    milestones: jsonb("milestones").$type<ServiceMilestone[]>().default([]).notNull(),
    turnaroundDays: integer("turnaround_days").default(14).notNull(),
    maxSlots: integer("max_slots").default(3).notNull(),
    revisionsIncluded: integer("revisions_included").default(2).notNull(),
    rating: contentRatingEnum("rating").default("SFW").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /** Despublicado por moderación: el artista no puede volver a publicarlo */
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderationReason: text("moderation_reason"),
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
    milestonesSnapshot: jsonb("milestones_snapshot").$type<OrderMilestone[]>().default([]).notNull(),
    /** Índice de la etapa en curso (plan MILESTONES) */
    currentMilestone: integer("current_milestone").default(0).notNull(),
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
    /** Desde cuándo está en el estado actual: base de todos los plazos automáticos */
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
    /** Avisos ya enviados para el estado actual (se reinicia en cada cambio de estado) */
    reminderStage: integer("reminder_stage").default(0).notNull(),
    /** Fecha estimada de la próxima entrega del artista (solo corre mientras le toca al artista) */
    workDueAt: timestamp("work_due_at", { withTimezone: true }),
    /** Última vez que cada parte abrió la sala del pedido (mensajes sin leer y avisos por email) */
    buyerSeenAt: timestamp("buyer_seen_at", { withTimezone: true }),
    artistSeenAt: timestamp("artist_seen_at", { withTimezone: true }),
    buyerNotifiedAt: timestamp("buyer_notified_at", { withTimezone: true }),
    artistNotifiedAt: timestamp("artist_notified_at", { withTimezone: true }),
    /** Los archivos de pedidos cerrados sin completar se eliminan pasado el plazo de retención */
    filesPurgedAt: timestamp("files_purged_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("commission_orders_buyer_idx").on(t.buyerId),
    index("commission_orders_artist_idx").on(t.artistId),
    index("commission_orders_service_status_idx").on(t.serviceId, t.status),
    index("commission_orders_status_changed_idx").on(t.status, t.statusChangedAt)
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
    /** Solo para stage = MILESTONE: índice de la etapa que paga */
    milestoneIndex: integer("milestone_index").default(0).notNull(),
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
  (t) => [uniqueIndex("order_milestone_payments_order_stage_uq").on(t.orderId, t.stage, t.milestoneIndex)]
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
    /** Oculta por moderación */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
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

// ─────────────────────────────────────────────────────────────
// ORDER_DISPUTE — reclamos sobre pedidos ya pagados.
// Mientras hay uno abierto el pedido está en DISPUTED; `statusBefore` es el estado al que vuelve.
// ─────────────────────────────────────────────────────────────
export const orderDisputes = pgTable(
  "order_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => commissionOrders.id, { onDelete: "cascade" }),
    openedById: uuid("opened_by_id").references(() => users.id, { onDelete: "set null" }), // null = sistema
    openerRole: disputePartyEnum("opener_role").notNull(),
    reason: disputeReasonEnum("reason").notNull(),
    description: text("description").notNull(),
    statusBefore: orderStatusEnum("status_before").notNull(),
    status: disputeStatusEnum("status").default("OPEN").notNull(),
    /** Propuesta del artista: cancelar reembolsando solo estos pagos (necesita el OK del comprador) */
    proposedRefundPaymentIds: jsonb("proposed_refund_payment_ids").$type<string[]>(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    resolution: disputeResolutionEnum("resolution"),
    resolutionNote: text("resolution_note"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("order_disputes_order_idx").on(t.orderId),
    index("order_disputes_status_idx").on(t.status, t.createdAt),
    // Un solo reclamo abierto por pedido
    uniqueIndex("order_disputes_one_open_uq")
      .on(t.orderId)
      .where(sql`${t.status} = 'OPEN'`)
  ]
);

// ─────────────────────────────────────────────────────────────
// REPORT — denuncias de contenido o de usuarios (cola de moderación)
// ─────────────────────────────────────────────────────────────
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** Artista involucrado (para agrupar denuncias por puestito) */
    artistId: uuid("artist_id").references(() => artistProfiles.id, { onDelete: "set null" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details").default("").notNull(),
    status: reportStatusEnum("status").default("OPEN").notNull(),
    resolutionNote: text("resolution_note"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [
    index("reports_status_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId)
  ]
);

// ─────────────────────────────────────────────────────────────
// SUPPORT_MESSAGE — contacto, botón de arrepentimiento y pedidos sobre datos personales
// ─────────────────────────────────────────────────────────────
export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: supportKindEnum("kind").notNull(),
    /** Código de gestión que recibe la persona (ej: ARR-7F3K2Q) */
    code: text("code").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    orderNumber: text("order_number"),
    message: text("message").default("").notNull(),
    status: supportStatusEnum("status").default("OPEN").notNull(),
    adminNote: text("admin_note"),
    handledById: uuid("handled_by_id").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index("support_messages_status_idx").on(t.status, t.createdAt)]
);

// ─────────────────────────────────────────────────────────────
// ADMIN_ACTION — registro de auditoría de todo lo que hace moderación
// ─────────────────────────────────────────────────────────────
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt()
  },
  (t) => [index("admin_actions_created_idx").on(t.createdAt)]
);
