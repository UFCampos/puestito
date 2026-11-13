import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, ilike, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  adminActions,
  artistProfiles,
  commissionOrders,
  commissionServices,
  orderDisputes,
  orderMilestonePayments,
  portfolioItems,
  reports,
  reviews,
  supportMessages,
  users
} from "../db/schema.js";
import { config, isProd } from "../config.js";
import { HttpError, isUuid, parseBody, requireAdmin, type SessionUser } from "../lib/http.js";
import { html, sendEmail } from "../services/notification.service.js";
import { DISPUTE_REASON_LABEL } from "../services/dispute.service.js";
import { adminResolveDispute, pauseOrdersOfSuspendedUser } from "../services/resolution.service.js";
import { runOrderTimers } from "../services/timers.service.js";
import { runCleanup } from "../services/cleanup.service.js";
import { storage } from "../services/storage.service.js";
import { ARTIST_WORK_STATUSES, BUYER_PAYMENT_STATUSES, TERMINAL_STATUSES, daysMs } from "../services/order.service.js";
import { REPORT_REASON_LABEL } from "./report.routes.js";

const note = z.string().trim().max(2000).default("");
const idParam = (request: { params: unknown }): string => {
  const { id } = request.params as { id: string };
  if (!isUuid(id)) throw new HttpError(404, "No encontrado");
  return id;
};

/** Todo lo que hace moderación queda en el registro de auditoría */
async function audit(
  admin: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  noteText?: string | null,
  metadata?: Record<string, unknown>
) {
  await db.insert(adminActions).values({ adminId: admin.id, action, targetType, targetId, note: noteText || null, metadata });
}

/** Aviso al dueño de un contenido o cuenta sobre una decisión de moderación */
async function notifyModeration(to: { email: string; name: string }, subject: string, body: string) {
  await sendEmail({
    to: to.email,
    subject,
    title: subject,
    html: `<p>Hola ${html.escape(to.name)},</p><p>${html.escape(body).replace(/\n/g, "<br/>")}</p><p>Si creés que es un error, respondé este correo o escribinos a ${html.escape(config.SUPPORT_EMAIL)}.</p>`,
    replyTo: config.SUPPORT_EMAIL
  });
}

async function artistOwner(artistId: string) {
  const [row] = await db
    .select({ email: users.email, name: users.name, username: users.username })
    .from(artistProfiles)
    .innerJoin(users, eq(artistProfiles.userId, users.id))
    .where(eq(artistProfiles.id, artistId))
    .limit(1);
  return row ?? null;
}

/**
 * /api/admin — panel de moderación y operaciones. Solo cuentas con rol ADMIN
 * (ver ADMIN_EMAILS); para el resto estas rutas responden 404.
 */
export async function adminRoutes(fastify: FastifyInstance) {
  // ───────────────────────────────────────────────────────────
  // GET /api/admin/overview — números del negocio, pendientes y chequeo de configuración
  // ───────────────────────────────────────────────────────────
  fastify.get("/overview", async (request) => {
    await requireAdmin(request);
    const now = new Date();
    const count = sql<number>`count(*)::int`;
    const [
      [userCount],
      [artistCount],
      [suspendedCount],
      byStatus,
      [openDisputes],
      [openReports],
      [openSupport],
      [money],
      [money30],
      [overdue],
      [unpaidStuck]
    ] = await Promise.all([
      db.select({ n: count }).from(users).where(sql`${users.deletedAt} is null`),
      db.select({ n: count }).from(artistProfiles),
      db.select({ n: count }).from(users).where(isNotNull(users.suspendedAt)),
      db.select({ status: commissionOrders.status, n: count }).from(commissionOrders).groupBy(commissionOrders.status),
      db.select({ n: count, oldest: sql<string | null>`min(${orderDisputes.createdAt})::text` }).from(orderDisputes).where(eq(orderDisputes.status, "OPEN")),
      db.select({ n: count }).from(reports).where(eq(reports.status, "OPEN")),
      db.select({ n: count }).from(supportMessages).where(eq(supportMessages.status, "OPEN")),
      db
        .select({
          gmv: sql<number>`coalesce(sum(${orderMilestonePayments.grossAmount}), 0)::int`,
          fees: sql<number>`coalesce(sum(${orderMilestonePayments.marketplaceFee}), 0)::int`
        })
        .from(orderMilestonePayments)
        .where(eq(orderMilestonePayments.status, "APPROVED")),
      db
        .select({
          gmv: sql<number>`coalesce(sum(${orderMilestonePayments.grossAmount}), 0)::int`,
          fees: sql<number>`coalesce(sum(${orderMilestonePayments.marketplaceFee}), 0)::int`
        })
        .from(orderMilestonePayments)
        .where(
          and(
            eq(orderMilestonePayments.status, "APPROVED"),
            sql`${orderMilestonePayments.paidAt} > now() - interval '30 days'`
          )
        ),
      db
        .select({ n: count })
        .from(commissionOrders)
        .where(and(inArray(commissionOrders.status, ARTIST_WORK_STATUSES), lt(commissionOrders.workDueAt, now))),
      db
        .select({ n: count })
        .from(commissionOrders)
        .where(
          and(
            inArray(commissionOrders.status, BUYER_PAYMENT_STATUSES),
            lt(commissionOrders.statusChangedAt, new Date(now.getTime() - daysMs(config.PAYMENT_TIMEOUT_DAYS)))
          )
        )
    ]);

    const orders = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
    const totalOrders = byStatus.reduce((acc, r) => acc + r.n, 0);
    const activeOrders = byStatus.filter((r) => !TERMINAL_STATUSES.includes(r.status)).reduce((acc, r) => acc + r.n, 0);

    // Lo que tiene que estar configurado antes de abrir al público
    const check = (key: string, ok: boolean, label: string, hint: string) => ({ key, ok, label, hint });
    const launchChecklist = [
      check("payments", config.PAYMENTS_MODE === "live", "Mercado Pago en modo real", "PAYMENTS_MODE=live con MP_CLIENT_ID, MP_CLIENT_SECRET y MP_WEBHOOK_SECRET."),
      check("storage", config.STORAGE_DRIVER === "r2", "Archivos en Cloudflare R2", "STORAGE_DRIVER=r2 con los dos buckets (público y privado)."),
      check("email", Boolean(config.RESEND_API_KEY), "Envío de emails (Resend)", "RESEND_API_KEY y el dominio del remitente verificado (SPF/DKIM)."),
      check("emailVerification", config.REQUIRE_EMAIL_VERIFICATION, "Verificación de email obligatoria", "REQUIRE_EMAIL_VERIFICATION=true."),
      check("alerts", Boolean(config.DISCORD_WEBHOOK_URL), "Alertas al canal de operaciones", "DISCORD_WEBHOOK_URL: ahí llegan errores, reclamos, denuncias y contracargos."),
      check("admins", config.ADMIN_EMAIL_LIST.length > 0, "Equipo de moderación definido", "ADMIN_EMAILS con los emails del equipo."),
      check("support", Boolean(process.env.SUPPORT_EMAIL), "Casilla de soporte definida", `SUPPORT_EMAIL (hoy ${config.SUPPORT_EMAIL}): tiene que existir y que alguien la lea.`),
      check("cookies", Boolean(config.COOKIE_DOMAIN) || !isProd, "Cookie de sesión compartida web ↔ API", "COOKIE_DOMAIN con el dominio padre (ej: tupuestito.com.ar)."),
      check("jobs", config.JOBS_INTERVAL_MINUTES > 0, "Plazos automáticos activos", "JOBS_INTERVAL_MINUTES mayor a 0.")
    ];

    return {
      counts: {
        users: userCount?.n ?? 0,
        artists: artistCount?.n ?? 0,
        suspendedUsers: suspendedCount?.n ?? 0,
        orders: totalOrders,
        activeOrders,
        completedOrders: orders.COMPLETED_HD_UNLOCKED ?? 0,
        openDisputes: openDisputes?.n ?? 0,
        openReports: openReports?.n ?? 0,
        openSupport: openSupport?.n ?? 0,
        overdueOrders: overdue?.n ?? 0,
        unpaidStuckOrders: unpaidStuck?.n ?? 0
      },
      oldestOpenDisputeAt: openDisputes?.oldest ?? null,
      ordersByStatus: orders,
      money: { gmv: money?.gmv ?? 0, fees: money?.fees ?? 0, gmv30d: money30?.gmv ?? 0, fees30d: money30?.fees ?? 0 },
      launchChecklist,
      rules: {
        depositExpirationHours: config.DEPOSIT_EXPIRATION_HOURS,
        requestExpirationDays: config.REQUEST_EXPIRATION_DAYS,
        reviewAutoApproveDays: config.REVIEW_AUTO_APPROVE_DAYS,
        paymentTimeoutDays: config.PAYMENT_TIMEOUT_DAYS,
        postDeliveryDisputeDays: config.POST_DELIVERY_DISPUTE_DAYS,
        platformFeePercent: config.PLATFORM_FEE_PERCENT
      },
      environment: { paymentsMode: config.PAYMENTS_MODE, storage: config.STORAGE_DRIVER, version: config.APP_VERSION, production: isProd }
    };
  });

  // ───────────────────────────────────────────────────────────
  // Reclamos
  // ───────────────────────────────────────────────────────────
  fastify.get("/disputes", async (request) => {
    await requireAdmin(request);
    const status = (request.query as { status?: string }).status === "RESOLVED" ? "RESOLVED" : "OPEN";
    const buyer = alias(users, "buyer");
    const artistUser = alias(users, "artist_user");
    const rows = await db
      .select({
        dispute: orderDisputes,
        orderId: commissionOrders.id,
        orderNumber: commissionOrders.orderNumber,
        orderStatus: commissionOrders.status,
        totalAmount: commissionOrders.totalAmount,
        serviceTitle: sql<string>`${commissionOrders.serviceSnapshot}->>'title'`,
        hasFinal: sql<boolean>`${commissionOrders.finalHdPrivateKey} is not null`,
        buyerUsername: buyer.username,
        artistUsername: artistUser.username,
        paid: sql<number>`coalesce((select sum(p.gross_amount) from ${orderMilestonePayments} p where p.order_id = ${commissionOrders.id} and p.status = 'APPROVED'), 0)::int`
      })
      .from(orderDisputes)
      .innerJoin(commissionOrders, eq(orderDisputes.orderId, commissionOrders.id))
      .innerJoin(buyer, eq(commissionOrders.buyerId, buyer.id))
      .innerJoin(artistProfiles, eq(commissionOrders.artistId, artistProfiles.id))
      .innerJoin(artistUser, eq(artistProfiles.userId, artistUser.id))
      .where(eq(orderDisputes.status, status))
      .orderBy(status === "OPEN" ? asc(orderDisputes.createdAt) : desc(orderDisputes.resolvedAt))
      .limit(100);
    return {
      disputes: rows.map((r) => ({
        id: r.dispute.id,
        status: r.dispute.status,
        reason: r.dispute.reason,
        reasonLabel: DISPUTE_REASON_LABEL[r.dispute.reason],
        description: r.dispute.description,
        openerRole: r.dispute.openerRole,
        statusBefore: r.dispute.statusBefore,
        hasProposal: Boolean(r.dispute.proposedRefundPaymentIds),
        resolution: r.dispute.resolution,
        resolutionNote: r.dispute.resolutionNote,
        createdAt: r.dispute.createdAt,
        resolvedAt: r.dispute.resolvedAt,
        order: {
          id: r.orderId,
          orderNumber: r.orderNumber,
          status: r.orderStatus,
          serviceTitle: r.serviceTitle,
          totalAmount: r.totalAmount,
          paidAmount: r.paid,
          hasFinalDelivery: r.hasFinal,
          buyerUsername: r.buyerUsername,
          artistUsername: r.artistUsername
        }
      }))
    };
  });

  // POST /api/admin/disputes/:id/resolve — RESUME (el pedido sigue), CANCEL o COMPLETE (libera el original)
  fastify.post("/disputes/:id/resolve", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ action: z.enum(["RESUME", "CANCEL", "COMPLETE"]), note }), request.body);
    const order = await adminResolveDispute(id, body.action, admin, body.note);
    await audit(admin, `dispute.${body.action.toLowerCase()}`, "order", order.id, body.note, { orderNumber: order.orderNumber, disputeId: id });
    return { ok: true, status: order.status };
  });

  // ───────────────────────────────────────────────────────────
  // Denuncias
  // ───────────────────────────────────────────────────────────
  fastify.get("/reports", async (request) => {
    await requireAdmin(request);
    const q = (request.query as { status?: string }).status;
    const status = q === "RESOLVED" || q === "DISMISSED" ? q : "OPEN";
    const reporter = alias(users, "reporter");
    const artistUser = alias(users, "artist_user");
    const rows = await db
      .select({ report: reports, reporterUsername: reporter.username, artistUsername: artistUser.username, artistUserId: artistUser.id, artistSuspended: artistUser.suspendedAt })
      .from(reports)
      .leftJoin(reporter, eq(reports.reporterId, reporter.id))
      .leftJoin(artistProfiles, eq(reports.artistId, artistProfiles.id))
      .leftJoin(artistUser, eq(artistProfiles.userId, artistUser.id))
      .where(eq(reports.status, status))
      .orderBy(status === "OPEN" ? asc(reports.createdAt) : desc(reports.resolvedAt))
      .limit(100);

    // Resumen de cada objetivo, para decidir sin salir del panel
    const ids = (type: string) => rows.filter((r) => r.report.targetType === type).map((r) => r.report.targetId);
    const [items, services, revs, orders] = await Promise.all([
      ids("PORTFOLIO_ITEM").length ? db.select().from(portfolioItems).where(inArray(portfolioItems.id, ids("PORTFOLIO_ITEM"))) : [],
      ids("SERVICE").length ? db.select().from(commissionServices).where(inArray(commissionServices.id, ids("SERVICE"))) : [],
      ids("REVIEW").length ? db.select().from(reviews).where(inArray(reviews.id, ids("REVIEW"))) : [],
      ids("ORDER").length
        ? db.select({ id: commissionOrders.id, orderNumber: commissionOrders.orderNumber, status: commissionOrders.status }).from(commissionOrders).where(inArray(commissionOrders.id, ids("ORDER")))
        : []
    ]);

    return {
      reports: rows.map((r) => {
        const { report } = r;
        let target: { label: string; imageUrl?: string | null; hidden?: boolean; text?: string | null } = { label: "(ya no existe)" };
        if (report.targetType === "ARTIST") target = { label: `Puestito de @${r.artistUsername ?? "?"}`, hidden: Boolean(r.artistSuspended) };
        const item = items.find((i) => i.id === report.targetId);
        if (item) target = { label: `Obra: ${item.title} (${item.rating})`, imageUrl: item.imageUrl, hidden: Boolean(item.hiddenAt) };
        const service = services.find((s) => s.id === report.targetId);
        if (service) target = { label: `Comisión: ${service.title} (${service.rating})`, text: service.description, hidden: Boolean(service.moderatedAt) };
        const review = revs.find((v) => v.id === report.targetId);
        if (review) target = { label: `Reseña de ${review.rating}★`, text: review.comment, hidden: Boolean(review.hiddenAt) };
        const order = orders.find((o) => o.id === report.targetId);
        if (order) target = { label: `Pedido #${order.orderNumber} (${order.status})` };
        return {
          id: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          reasonLabel: REPORT_REASON_LABEL[report.reason],
          details: report.details,
          status: report.status,
          resolutionNote: report.resolutionNote,
          createdAt: report.createdAt,
          resolvedAt: report.resolvedAt,
          reporterUsername: r.reporterUsername,
          artistId: report.artistId,
          artistUserId: r.artistUserId,
          artistUsername: r.artistUsername,
          target
        };
      })
    };
  });

  fastify.post("/reports/:id/resolve", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ status: z.enum(["RESOLVED", "DISMISSED"]), note }), request.body);
    const [updated] = await db
      .update(reports)
      .set({ status: body.status, resolutionNote: body.note || null, resolvedById: admin.id, resolvedAt: new Date() })
      .where(and(eq(reports.id, id), eq(reports.status, "OPEN")))
      .returning();
    if (!updated) throw new HttpError(409, "La denuncia no existe o ya fue resuelta");
    await audit(admin, `report.${body.status.toLowerCase()}`, "report", id, body.note, { targetType: updated.targetType, targetId: updated.targetId });
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // Pedidos
  // ───────────────────────────────────────────────────────────
  fastify.get("/orders", async (request) => {
    await requireAdmin(request);
    const query = request.query as { filter?: string; q?: string };
    const q = query.q?.trim().replace(/^#/, "") ?? "";
    const now = new Date();
    const buyer = alias(users, "buyer");
    const artistUser = alias(users, "artist_user");

    const conditions = [];
    if (query.filter === "active") conditions.push(notInArray(commissionOrders.status, TERMINAL_STATUSES));
    if (query.filter === "disputed") conditions.push(eq(commissionOrders.status, "DISPUTED"));
    if (query.filter === "overdue") {
      conditions.push(inArray(commissionOrders.status, ARTIST_WORK_STATUSES), lt(commissionOrders.workDueAt, now));
    }
    if (query.filter === "unpaid") {
      conditions.push(
        inArray(commissionOrders.status, BUYER_PAYMENT_STATUSES),
        lt(commissionOrders.statusChangedAt, new Date(now.getTime() - daysMs(config.PAYMENT_TIMEOUT_DAYS)))
      );
    }
    if (q) {
      conditions.push(
        or(ilike(commissionOrders.orderNumber, `%${q}%`), ilike(buyer.username, `%${q}%`), ilike(artistUser.username, `%${q}%`))
      );
    }

    const rows = await db
      .select({
        id: commissionOrders.id,
        orderNumber: commissionOrders.orderNumber,
        status: commissionOrders.status,
        totalAmount: commissionOrders.totalAmount,
        paymentPlan: commissionOrders.paymentPlanSnapshot,
        serviceTitle: sql<string>`${commissionOrders.serviceSnapshot}->>'title'`,
        statusChangedAt: commissionOrders.statusChangedAt,
        workDueAt: commissionOrders.workDueAt,
        createdAt: commissionOrders.createdAt,
        buyerUsername: buyer.username,
        artistUsername: artistUser.username
      })
      .from(commissionOrders)
      .innerJoin(buyer, eq(commissionOrders.buyerId, buyer.id))
      .innerJoin(artistProfiles, eq(commissionOrders.artistId, artistProfiles.id))
      .innerJoin(artistUser, eq(artistProfiles.userId, artistUser.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(commissionOrders.updatedAt))
      .limit(100);
    return { orders: rows };
  });

  // ───────────────────────────────────────────────────────────
  // Usuarios y puestitos
  // ───────────────────────────────────────────────────────────
  fastify.get("/users", async (request) => {
    await requireAdmin(request);
    const query = request.query as { q?: string; filter?: string };
    const q = query.q?.trim().replace(/^@/, "") ?? "";
    const conditions = [];
    if (q) conditions.push(or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)));
    if (query.filter === "suspended") conditions.push(isNotNull(users.suspendedAt));
    if (query.filter === "artists") conditions.push(isNotNull(artistProfiles.id));
    if (query.filter === "admins") conditions.push(eq(users.role, "ADMIN"));
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        role: users.role,
        emailVerified: users.emailVerified,
        suspendedAt: users.suspendedAt,
        suspensionReason: users.suspensionReason,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        artistId: artistProfiles.id,
        isVerifiedHuman: artistProfiles.isVerifiedHuman,
        commissionStatus: artistProfiles.commissionStatus
      })
      .from(users)
      .leftJoin(artistProfiles, eq(artistProfiles.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(100);
    return { users: rows };
  });

  // Suspender: la cuenta queda en solo lectura, su puestito sale de la vidriera y sus pedidos se pausan
  fastify.post("/users/:id/suspend", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ reason: z.string().trim().min(5, "Indicá el motivo de la suspensión").max(1000) }), request.body);
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target || target.deletedAt) throw new HttpError(404, "Usuario no encontrado");
    if (target.id === admin.id) throw new HttpError(400, "No podés suspender tu propia cuenta");
    if (target.role === "ADMIN") throw new HttpError(409, "No se puede suspender a otra cuenta de administración");
    if (target.suspendedAt) throw new HttpError(409, "La cuenta ya está suspendida");

    await db.update(users).set({ suspendedAt: new Date(), suspensionReason: body.reason }).where(eq(users.id, id));
    const paused = await pauseOrdersOfSuspendedUser(id);
    await audit(admin, "user.suspend", "user", id, body.reason, { username: target.username, ...paused });
    void notifyModeration(
      target,
      "Tu cuenta de TuPuestito fue suspendida",
      `Suspendimos tu cuenta @${target.username}.\nMotivo: ${body.reason}\nMientras esté suspendida podés ver tus pedidos y descargar lo que ya pagaste, pero no realizar nuevas acciones.`
    );
    return { ok: true, ...paused };
  });

  fastify.post("/users/:id/unsuspend", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ note }), request.body);
    const [target] = await db
      .update(users)
      .set({ suspendedAt: null, suspensionReason: null })
      .where(and(eq(users.id, id), isNotNull(users.suspendedAt)))
      .returning();
    if (!target) throw new HttpError(409, "La cuenta no está suspendida");
    await audit(admin, "user.unsuspend", "user", id, body.note, { username: target.username });
    void notifyModeration(target, "Tu cuenta de TuPuestito fue reactivada", "Levantamos la suspensión de tu cuenta. Ya podés volver a usar TuPuestito con normalidad.");
    return { ok: true };
  });

  // Insignia "100% Humano Verificado" (anti-IA)
  fastify.post("/artists/:id/verify-human", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ verified: z.boolean(), note }), request.body);
    const [updated] = await db
      .update(artistProfiles)
      .set({ isVerifiedHuman: body.verified })
      .where(eq(artistProfiles.id, id))
      .returning({ id: artistProfiles.id });
    if (!updated) throw new HttpError(404, "Artista no encontrado");
    await audit(admin, body.verified ? "artist.verify_human" : "artist.unverify_human", "artist", id, body.note);
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // Contenido: ocultar o eliminar obras, despublicar comisiones, ocultar reseñas
  // ───────────────────────────────────────────────────────────
  fastify.post("/portfolio/:id/hide", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ hidden: z.boolean(), reason: note }), request.body);
    const [item] = await db
      .update(portfolioItems)
      .set({ hiddenAt: body.hidden ? new Date() : null, hiddenReason: body.hidden ? body.reason || null : null })
      .where(eq(portfolioItems.id, id))
      .returning();
    if (!item) throw new HttpError(404, "Obra no encontrada");
    await audit(admin, body.hidden ? "portfolio.hide" : "portfolio.unhide", "portfolio_item", id, body.reason, { title: item.title });
    const owner = await artistOwner(item.artistId);
    if (owner && body.hidden) {
      void notifyModeration(owner, "Ocultamos una obra de tu portfolio", `La obra "${item.title}" dejó de mostrarse en tu puestito.${body.reason ? `\nMotivo: ${body.reason}` : ""}`);
    }
    return { ok: true };
  });

  // Eliminación definitiva: borra también el archivo (obligatorio ante contenido ilegal)
  fastify.delete("/portfolio/:id", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ reason: z.string().trim().min(5, "Indicá el motivo").max(1000) }), request.body);
    const [item] = await db.delete(portfolioItems).where(eq(portfolioItems.id, id)).returning();
    if (!item) throw new HttpError(404, "Obra no encontrada");
    if (item.imageKey) await storage.delete("public", item.imageKey);
    await audit(admin, "portfolio.delete", "portfolio_item", id, body.reason, { title: item.title, artistId: item.artistId });
    const owner = await artistOwner(item.artistId);
    if (owner) void notifyModeration(owner, "Eliminamos una obra de tu portfolio", `La obra "${item.title}" fue eliminada por moderación.\nMotivo: ${body.reason}`);
    return { ok: true };
  });

  fastify.post("/services/:id/moderate", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ hidden: z.boolean(), reason: note }), request.body);
    const [service] = await db
      .update(commissionServices)
      .set(
        body.hidden
          ? { moderatedAt: new Date(), moderationReason: body.reason || null, isActive: false }
          : // Al levantar la medida queda pausada: la vuelve a publicar el artista
            { moderatedAt: null, moderationReason: null }
      )
      .where(eq(commissionServices.id, id))
      .returning();
    if (!service) throw new HttpError(404, "Comisión no encontrada");
    await audit(admin, body.hidden ? "service.moderate" : "service.unmoderate", "service", id, body.reason, { title: service.title });
    const owner = await artistOwner(service.artistId);
    if (owner) {
      void notifyModeration(
        owner,
        body.hidden ? "Despublicamos una de tus comisiones" : "Ya podés volver a publicar tu comisión",
        body.hidden
          ? `La comisión "${service.title}" dejó de estar publicada.${body.reason ? `\nMotivo: ${body.reason}` : ""}\nLos pedidos que ya estaban en curso no cambian.`
          : `Levantamos la medida sobre "${service.title}". Quedó pausada: publicala de nuevo desde tu panel cuando quieras.`
      );
    }
    return { ok: true };
  });

  fastify.post("/reviews/:id/hide", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ hidden: z.boolean(), reason: note }), request.body);
    const [review] = await db
      .update(reviews)
      .set({ hiddenAt: body.hidden ? new Date() : null })
      .where(eq(reviews.id, id))
      .returning({ id: reviews.id });
    if (!review) throw new HttpError(404, "Reseña no encontrada");
    await audit(admin, body.hidden ? "review.hide" : "review.unhide", "review", id, body.reason);
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // Soporte: consultas, pedidos de arrepentimiento y de datos personales
  // ───────────────────────────────────────────────────────────
  fastify.get("/support", async (request) => {
    await requireAdmin(request);
    const status = (request.query as { status?: string }).status === "CLOSED" ? "CLOSED" : "OPEN";
    const rows = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.status, status))
      .orderBy(status === "OPEN" ? asc(supportMessages.createdAt) : desc(supportMessages.handledAt))
      .limit(100);
    return { messages: rows };
  });

  fastify.post("/support/:id/close", async (request) => {
    const admin = await requireAdmin(request);
    const id = idParam(request);
    const body = parseBody(z.object({ note }), request.body);
    const [updated] = await db
      .update(supportMessages)
      .set({ status: "CLOSED", adminNote: body.note || null, handledById: admin.id, handledAt: new Date() })
      .where(and(eq(supportMessages.id, id), eq(supportMessages.status, "OPEN")))
      .returning({ code: supportMessages.code });
    if (!updated) throw new HttpError(409, "La consulta no existe o ya está cerrada");
    await audit(admin, "support.close", "support_message", id, body.note, { code: updated.code });
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // Auditoría y tareas programadas
  // ───────────────────────────────────────────────────────────
  fastify.get("/audit", async (request) => {
    await requireAdmin(request);
    const rows = await db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        targetType: adminActions.targetType,
        targetId: adminActions.targetId,
        note: adminActions.note,
        metadata: adminActions.metadata,
        createdAt: adminActions.createdAt,
        adminUsername: users.username
      })
      .from(adminActions)
      .leftJoin(users, eq(adminActions.adminId, users.id))
      .orderBy(desc(adminActions.createdAt))
      .limit(200);
    return { actions: rows };
  });

  // POST /api/admin/jobs/run — corre a mano los plazos automáticos y/o la limpieza.
  // Fuera de producción acepta `now` para simular el paso del tiempo (lo usan los tests e2e).
  fastify.post("/jobs/run", async (request) => {
    const admin = await requireAdmin(request);
    const body = parseBody(
      z.object({ job: z.enum(["timers", "cleanup", "all"]).default("timers"), now: z.string().datetime().optional() }),
      request.body
    );
    if (body.now && isProd) throw new HttpError(400, "En producción no se puede simular otra fecha");
    const now = body.now ? new Date(body.now) : new Date();
    const timers = body.job !== "cleanup" ? await runOrderTimers(now) : null;
    const cleanup = body.job !== "timers" ? await runCleanup(now) : null;
    await audit(admin, "jobs.run", "system", body.job, null, { simulatedNow: body.now ?? null, timers, cleanup });
    return { ok: true, timers, cleanup };
  });
}
