import type { FastifyInstance, FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import sharp from "sharp";
import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import {
  artistProfiles,
  commissionAddons,
  commissionOrders,
  commissionServices,
  orderMessages,
  orderMilestonePayments,
  reviews,
  users
} from "../db/schema.js";
import { config } from "../config.js";
import { HttpError, parseBody, requireUser, type SessionUser } from "../lib/http.js";
import { MAX_REFERENCE_BYTES, extensionFor, newKey, storage } from "../services/storage.service.js";
import { DELIVERY_FORMATS, LIMITS, LIMITS_MB, sniffArchive } from "../lib/limits.js";
import { WatermarkService } from "../services/watermark.service.js";
import { MercadoPagoService, MercadoPagoError } from "../services/mercadopago.service.js";
import { notifyDiscord } from "../services/notification.service.js";
import { loadAvatar } from "./artist.routes.js";
import {
  PLAN_LABEL,
  SLOT_STATUSES,
  addSystemMessage,
  computeAmounts,
  expectedStage,
  getArtistMpToken,
  milestoneFee,
  neutralTitle,
  nextOrderNumber,
  notifyOrder,
  transition,
  type Order
} from "../services/order.service.js";


/** Carga el pedido y determina el rol del usuario; 404 si no participa (no revela existencia) */
async function loadOrderFor(request: FastifyRequest, user: SessionUser) {
  const { id } = request.params as { id: string };
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Pedido no encontrado");
  const [row] = await db
    .select({ order: commissionOrders, artistUserId: artistProfiles.userId, artistProfile: artistProfiles })
    .from(commissionOrders)
    .innerJoin(artistProfiles, eq(commissionOrders.artistId, artistProfiles.id))
    .where(eq(commissionOrders.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "Pedido no encontrado");
  const isBuyer = row.order.buyerId === user.id;
  const isArtist = row.artistUserId === user.id;
  const isAdmin = user.role === "ADMIN";
  if (!isBuyer && !isArtist && !isAdmin) throw new HttpError(404, "Pedido no encontrado");
  return { order: row.order, artistProfile: row.artistProfile, isBuyer, isArtist, isAdmin };
}

function assertStatus(order: Order, ...allowed: Order["status"][]) {
  if (!allowed.includes(order.status)) {
    throw new HttpError(409, "Esta acción no está disponible en el estado actual del pedido");
  }
}

function multipartField(file: MultipartFile, name: string): string | undefined {
  const f = (file.fields as Record<string, { value?: unknown } | undefined>)[name];
  return typeof f?.value === "string" ? f.value : undefined;
}

async function signAll(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map((k) => storage.signedGetUrl(k)));
}

export async function orderRoutes(fastify: FastifyInstance) {
  // ───────────────────────────────────────────────────────────
  // POST /api/orders — Crear solicitud (Plan §6)
  // ───────────────────────────────────────────────────────────
  fastify.post("/", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const body = parseBody(
      z.object({
        serviceId: z.string().uuid(),
        addonIds: z.array(z.string().uuid()).max(10).default([]),
        buyerBrief: z.string().trim().min(10, "Contale al artista un poco más sobre tu pedido").max(8000),
        referenceKeys: z.array(z.string()).max(10, "Máximo 10 imágenes de referencia").default([]),
        externalBoardUrl: z
          .string()
          .trim()
          .max(1000)
          .url("Link inválido")
          .refine((u) => u.startsWith("https://"), "El link al tablero debe empezar con https://")
          .optional()
          .or(z.literal("").transform(() => undefined)),
        acceptedTerms: z.literal(true, {
          errorMap: () => ({ message: "Tenés que aceptar los Términos del artista y la modalidad de pago" })
        })
      }),
      request.body
    );

    const [row] = await db
      .select({ service: commissionServices, profile: artistProfiles, artistUser: users })
      .from(commissionServices)
      .innerJoin(artistProfiles, eq(commissionServices.artistId, artistProfiles.id))
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .where(and(eq(commissionServices.id, body.serviceId), eq(commissionServices.isActive, true)))
      .limit(1);
    if (!row) throw new HttpError(404, "Servicio de comisión no encontrado");
    const { service, profile, artistUser } = row;

    if (artistUser.id === user.id) throw new HttpError(400, "No podés encargarte una comisión a vos mismo/a");
    if (profile.commissionStatus === "CLOSED") throw new HttpError(409, "El artista tiene las comisiones cerradas");

    // Precio calculado SIEMPRE en el servidor a partir de los addons reales
    const addons = body.addonIds.length
      ? await db
          .select()
          .from(commissionAddons)
          .where(
            and(
              inArray(commissionAddons.id, body.addonIds),
              eq(commissionAddons.serviceId, service.id),
              eq(commissionAddons.isActive, true)
            )
          )
      : [];
    if (addons.length !== new Set(body.addonIds).size) throw new HttpError(400, "Algún extra seleccionado ya no está disponible");

    // Referencias: deben ser subidas por este usuario, existir y respetar tipo/tamaño
    const refPrefix = `refs/${user.id}/`;
    const refs = [...new Set(body.referenceKeys)];
    for (const key of refs) {
      if (!key.startsWith(refPrefix) || key.includes("..")) throw new HttpError(400, "Referencia inválida");
      const head = await storage.head("private", key);
      if (!head) throw new HttpError(400, "Alguna referencia no terminó de subirse. Volvé a intentarlo.");
      if (head.size > MAX_REFERENCE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(head.contentType)) {
        throw new HttpError(400, "Las referencias deben ser PNG, JPG o WebP de hasta 5 MB");
      }
    }

    const totalAmount = service.priceArs + addons.reduce((acc, a) => acc + a.priceArs, 0);
    const amounts = computeAmounts(service.paymentPlan, totalAmount);
    const termsSnapshot = [
      `Términos de Servicio de @${artistUser.username}:`,
      profile.termsOfService?.trim() || "(El artista no publicó términos propios; aplican los Términos de TuPuestito.)",
      "",
      `Modalidad de pago aceptada: ${PLAN_LABEL[service.paymentPlan]}.`,
      "El comprador entiende que la seña inicial no es reembolsable una vez entregado el boceto."
    ].join("\n");

    const order = await db.transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx);
      const [created] = await tx
        .insert(commissionOrders)
        .values({
          orderNumber,
          buyerId: user.id,
          artistId: profile.id,
          serviceId: service.id,
          status: "REQUESTED",
          paymentPlanSnapshot: service.paymentPlan,
          termsSnapshot,
          termsAcceptedAt: new Date(),
          serviceSnapshot: {
            title: service.title,
            priceArs: service.priceArs,
            turnaroundDays: service.turnaroundDays,
            revisionsIncluded: service.revisionsIncluded,
            rating: service.rating
          },
          addonsSnapshot: addons.map((a) => ({ id: a.id, name: a.name, priceArs: a.priceArs })),
          currency: "ARS",
          totalAmount,
          ...amounts,
          buyerBrief: body.buyerBrief,
          referenceImages: refs,
          externalBoardUrl: body.externalBoardUrl ?? null
        })
        .returning();
      await addSystemMessage(
        tx,
        created!.id,
        `📝 Solicitud #${orderNumber} enviada con ${refs.length} referencia(s). Modalidad pactada: ${PLAN_LABEL[service.paymentPlan]}. Esperando que el artista acepte el pedido.`
      );
      return created!;
    });

    void notifyOrder(order, "artist", "Nueva solicitud de comisión", `@${user.username} te pidió "${service.title}". Revisá el brief y aceptá o rechazá la solicitud.`);
    void notifyDiscord(`📝 Nueva solicitud #${order.orderNumber}: @${user.username} → @${artistUser.username} ($${totalAmount} ARS)`);
    return { id: order.id, orderNumber: order.orderNumber };
  });

  // ───────────────────────────────────────────────────────────
  // GET /api/orders — pedidos como comprador y como artista
  // ───────────────────────────────────────────────────────────
  fastify.get("/", async (request) => {
    const user = await requireUser(request);
    const [profile] = await db.select({ id: artistProfiles.id }).from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
    const buyer = alias(users, "buyer");
    const rows = await db
      .select({
        order: commissionOrders,
        buyerName: buyer.name,
        buyerUsername: buyer.username,
        artistName: users.name,
        artistUsername: users.username
      })
      .from(commissionOrders)
      .innerJoin(buyer, eq(commissionOrders.buyerId, buyer.id))
      .innerJoin(artistProfiles, eq(commissionOrders.artistId, artistProfiles.id))
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .where(
        profile
          ? or(eq(commissionOrders.buyerId, user.id), eq(commissionOrders.artistId, profile.id))
          : eq(commissionOrders.buyerId, user.id)
      )
      .orderBy(desc(commissionOrders.updatedAt))
      .limit(200);

    return {
      orders: rows.map((r) => ({
        id: r.order.id,
        orderNumber: r.order.orderNumber,
        status: r.order.status,
        paymentPlanSnapshot: r.order.paymentPlanSnapshot,
        totalAmount: r.order.totalAmount,
        currency: r.order.currency,
        buyerBrief: r.order.buyerBrief,
        createdAt: r.order.createdAt,
        updatedAt: r.order.updatedAt,
        serviceTitle: r.order.serviceSnapshot.title,
        buyerName: r.buyerName,
        buyerUsername: r.buyerUsername,
        artistName: r.artistName,
        artistUsername: r.artistUsername,
        role: r.order.buyerId === user.id ? "BUYER" : "ARTIST"
      }))
    };
  });

  // ───────────────────────────────────────────────────────────
  // GET /api/orders/:id — sala del pedido
  // ───────────────────────────────────────────────────────────
  fastify.get("/:id", async (request) => {
    const user = await requireUser(request);
    const { order, artistProfile, isBuyer, isArtist } = await loadOrderFor(request, user);

    const [buyer] = await db
      .select({ id: users.id, displayName: users.name, username: users.username, avatarUrl: users.image })
      .from(users)
      .where(eq(users.id, order.buyerId));
    const [artistUser] = await db
      .select({ displayName: users.name, username: users.username, avatarUrl: users.image })
      .from(users)
      .where(eq(users.id, artistProfile.userId));

    const [messages, payments, [review]] = await Promise.all([
      db
        .select({
          id: orderMessages.id,
          type: orderMessages.type,
          content: orderMessages.content,
          attachments: orderMessages.attachments,
          createdAt: orderMessages.createdAt,
          senderId: orderMessages.senderId,
          senderName: users.name,
          senderAvatar: users.image
        })
        .from(orderMessages)
        .leftJoin(users, eq(orderMessages.senderId, users.id))
        .where(eq(orderMessages.orderId, order.id))
        .orderBy(asc(orderMessages.createdAt))
        .limit(500),
      db
        .select({
          id: orderMilestonePayments.id,
          stage: orderMilestonePayments.stage,
          grossAmount: orderMilestonePayments.grossAmount,
          marketplaceFee: orderMilestonePayments.marketplaceFee,
          status: orderMilestonePayments.status,
          paidAt: orderMilestonePayments.paidAt,
          mpPaymentId: orderMilestonePayments.mpPaymentId
        })
        .from(orderMilestonePayments)
        .where(eq(orderMilestonePayments.orderId, order.id))
        .orderBy(asc(orderMilestonePayments.createdAt)),
      db.select().from(reviews).where(eq(reviews.orderId, order.id)).limit(1)
    ]);

    // URLs firmadas de vida corta: nada del pedido es público (Plan §2 y §3)
    const signedMessages = await Promise.all(
      messages.map(async (m) => ({ ...m, attachments: await signAll(m.attachments) }))
    );
    const hdUnlocked = order.status === "COMPLETED_HD_UNLOCKED";

    const { finalHdPrivateKey, sketchWatermarkedKey, previewWatermarkedKey, referenceImages, ...rest } = order;
    return {
      order: {
        ...rest,
        referenceImages: await signAll(referenceImages),
        sketchWatermarkedUrl: sketchWatermarkedKey ? await storage.signedGetUrl(sketchWatermarkedKey) : null,
        previewWatermarkedUrl: previewWatermarkedKey ? await storage.signedGetUrl(previewWatermarkedKey) : null,
        hasFinalHd: Boolean(finalHdPrivateKey),
        hdUnlocked
      },
      nextPaymentStage: expectedStage(order),
      depositExpiresAt:
        order.status === "ACCEPTED_WAITING_DEPOSIT" && order.acceptedAt
          ? new Date(order.acceptedAt.getTime() + config.DEPOSIT_EXPIRATION_HOURS * 3600_000)
          : null,
      buyer,
      artist: { id: artistProfile.id, ...artistUser, defaultWatermarkMode: artistProfile.defaultWatermarkMode },
      isBuyer,
      isArtist,
      currentUserId: user.id,
      messages: signedMessages,
      payments,
      review: review ?? null
    };
  });

  // ───────────────────────────────────────────────────────────
  // Artista acepta / rechaza; comprador o artista cancelan antes de pagar
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/accept", async (request) => {
    const user = await requireUser(request);
    const { order, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede aceptar este pedido");
    assertStatus(order, "REQUESTED");

    const updated = await db.transaction(async (tx) => {
      // Cupos: bloqueamos el servicio para contar sin carreras
      const [service] = await tx.select().from(commissionServices).where(eq(commissionServices.id, order.serviceId)).for("update");
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(commissionOrders)
        .where(and(eq(commissionOrders.serviceId, order.serviceId), inArray(commissionOrders.status, SLOT_STATUSES)))) as [{ n: number }];
      if (service && n >= service.maxSlots) {
        throw new HttpError(409, `Ya tenés ${n}/${service.maxSlots} cupos ocupados para este servicio. Terminá un pedido o ampliá los cupos.`);
      }
      const o = await transition(tx, order.id, "REQUESTED", "ACCEPTED_WAITING_DEPOSIT", { acceptedAt: new Date() });
      await addSystemMessage(
        tx,
        order.id,
        `✅ El artista aceptó la comisión. El comprador tiene ${config.DEPOSIT_EXPIRATION_HOURS} hs para abonar el primer pago.`
      );
      return o;
    });
    void notifyOrder(updated, "buyer", "¡Tu comisión fue aceptada!", `Aboná el pago inicial dentro de las ${config.DEPOSIT_EXPIRATION_HOURS} hs para que el artista empiece.`);
    return { ok: true, status: updated.status };
  });

  fastify.post("/:id/reject", async (request) => {
    const user = await requireUser(request);
    const { order, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede rechazar este pedido");
    const { reason } = parseBody(z.object({ reason: z.string().trim().max(1000).optional() }), request.body);
    assertStatus(order, "REQUESTED");
    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "REQUESTED", "REJECTED");
      await addSystemMessage(tx, order.id, `❌ El artista rechazó la solicitud (sin cobro).${reason ? ` Motivo: "${reason}"` : ""}`);
      return o;
    });
    void notifyOrder(updated, "buyer", "Solicitud rechazada", reason ? `El artista no puede tomar tu pedido: ${reason}` : "El artista no puede tomar tu pedido en este momento. No se realizó ningún cobro.");
    return { ok: true, status: updated.status };
  });

  fastify.post("/:id/cancel", async (request) => {
    const user = await requireUser(request);
    const { order, isArtist, isBuyer } = await loadOrderFor(request, user);
    if (!isArtist && !isBuyer) throw new HttpError(403, "No autorizado");
    // Una vez acreditado un pago, la cancelación/reembolso pasa por soporte
    assertStatus(order, "REQUESTED", "ACCEPTED_WAITING_DEPOSIT");
    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, ["REQUESTED", "ACCEPTED_WAITING_DEPOSIT"], "CANCELLED");
      await tx
        .update(orderMilestonePayments)
        .set({ status: "REJECTED" })
        .where(and(eq(orderMilestonePayments.orderId, order.id), eq(orderMilestonePayments.status, "PENDING")));
      await addSystemMessage(tx, order.id, `🚫 El pedido fue cancelado por ${isArtist ? "el artista" : "el comprador"} antes de cualquier pago.`);
      return o;
    });
    void notifyOrder(updated, isArtist ? "buyer" : "artist", "Pedido cancelado", `El pedido fue cancelado por ${isArtist ? "el artista" : "el comprador"}.`);
    return { ok: true, status: updated.status };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/checkout — preferencia de Mercado Pago del hito actual
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/checkout", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede abonar");
    const stage = expectedStage(order);
    if (!stage) throw new HttpError(409, "No hay ningún pago pendiente en este momento");

    const amount = stage === "FINAL_50" ? order.finalAmount : order.depositAmount;
    const fee = milestoneFee(order, stage);

    const [existing] = await db
      .select()
      .from(orderMilestonePayments)
      .where(and(eq(orderMilestonePayments.orderId, order.id), eq(orderMilestonePayments.stage, stage)))
      .limit(1);
    if (existing?.status === "APPROVED") throw new HttpError(409, "Este pago ya fue acreditado");

    const [milestone] = existing
      ? await db
          .update(orderMilestonePayments)
          .set({ status: "PENDING", grossAmount: amount, marketplaceFee: fee })
          .where(eq(orderMilestonePayments.id, existing.id))
          .returning()
      : await db
          .insert(orderMilestonePayments)
          .values({ orderId: order.id, stage, provider: "MERCADOPAGO", grossAmount: amount, marketplaceFee: fee })
          .returning();

    if (config.PAYMENTS_MODE === "mock") {
      const url = `${config.API_URL}/api/payments/mock-checkout?milestone=${milestone!.id}`;
      await db.update(orderMilestonePayments).set({ checkoutUrl: url, mpPreferenceId: `mock_${milestone!.id}` }).where(eq(orderMilestonePayments.id, milestone!.id));
      return { initPoint: url, milestoneId: milestone!.id };
    }

    const mp = await getArtistMpToken(order.artistId);
    if (!mp) throw new HttpError(409, "El artista todavía no vinculó su cuenta de Mercado Pago. Avisale por el chat del pedido.");

    const [artistUser] = await db
      .select({ username: users.username })
      .from(artistProfiles)
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .where(eq(artistProfiles.id, order.artistId));

    try {
      const preference = await MercadoPagoService.createPreference({
        sellerAccessToken: mp.token,
        milestoneId: milestone!.id,
        orderId: order.id,
        title: neutralTitle(order.orderNumber, artistUser?.username ?? "artista", stage),
        amountArs: amount,
        marketplaceFeeArs: fee,
        payerEmail: user.email,
        expiresAt:
          stage !== "FINAL_50" && order.acceptedAt
            ? new Date(order.acceptedAt.getTime() + config.DEPOSIT_EXPIRATION_HOURS * 3600_000)
            : undefined
      });
      const initPoint = mp.liveMode ? preference.init_point : preference.sandbox_init_point || preference.init_point;
      await db
        .update(orderMilestonePayments)
        .set({ mpPreferenceId: preference.id, checkoutUrl: initPoint })
        .where(eq(orderMilestonePayments.id, milestone!.id));
      return { initPoint, milestoneId: milestone!.id };
    } catch (err) {
      request.log.error({ err }, "Error creando preferencia de Mercado Pago");
      if (err instanceof MercadoPagoError && err.status === 401) {
        throw new HttpError(502, "La vinculación de Mercado Pago del artista venció. Pedile que la reconecte.");
      }
      throw new HttpError(502, "Mercado Pago no respondió. Probá de nuevo en unos minutos.");
    }
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/messages — hilo privado
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/messages", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer, isArtist } = await loadOrderFor(request, user);
    if (!isBuyer && !isArtist) throw new HttpError(403, "Solo los participantes pueden escribir");
    if (["REJECTED", "EXPIRED", "CANCELLED"].includes(order.status)) {
      throw new HttpError(409, "El hilo de este pedido está cerrado");
    }
    const { content } = parseBody(z.object({ content: z.string().trim().min(1).max(4000) }), request.body);
    const [msg] = await db.insert(orderMessages).values({ orderId: order.id, senderId: user.id, type: "TEXT", content }).returning({ id: orderMessages.id });
    return { id: msg!.id, ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/sketch — artista sube boceto (marca de agua)
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/sketch", async (request) => {
    const user = await requireUser(request);
    const { order, artistProfile, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede subir bocetos");
    assertStatus(order, "IN_PROGRESS_SKETCH");

    const file = await request.file({ limits: { fileSize: LIMITS.sketchBytes } });
    if (!file) throw new HttpError(400, "Archivo requerido");
    const buffer = await file.toBuffer().catch(() => null);
    if (!buffer || file.file.truncated) throw new HttpError(413, `El boceto supera los ${LIMITS_MB.sketch} MB`);
    await WatermarkService.assertImage(buffer).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    const mode = z.enum(["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"]).catch(artistProfile.defaultWatermarkMode).parse(multipartField(file, "watermarkMode"));

    const watermarked = await WatermarkService.apply(buffer, {
      mode,
      username: user.username,
      customText: artistProfile.watermarkCustomText,
      avatar: mode === "AUTO_AVATAR" ? await loadAvatar(user.image) : null,
      maxWidth: 1400
    });
    const key = newKey(`orders/${order.id}/sketch`, "webp");
    await storage.put("private", key, watermarked, "image/webp");

    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "IN_PROGRESS_SKETCH", "SKETCH_REVIEW", { sketchWatermarkedKey: key });
      await tx.insert(orderMessages).values({
        orderId: order.id,
        senderId: user.id,
        type: "SKETCH_SUBMISSION",
        content: "✏️ El artista subió una propuesta de boceto (con marca de agua) para tu revisión.",
        attachments: [key]
      });
      return o;
    });
    void notifyOrder(updated, "buyer", "Tenés un boceto para revisar", "El artista subió el boceto de tu comisión. Aprobalo o pedí ajustes desde la sala del pedido.");
    return { ok: true, status: updated.status };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/request-changes — comprador pide ajustes
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/request-changes", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede pedir cambios");
    assertStatus(order, "SKETCH_REVIEW", "FINAL_PREVIEW_REVIEW");
    const { feedback } = parseBody(z.object({ feedback: z.string().trim().min(3).max(2000) }), request.body);

    const included = order.serviceSnapshot.revisionsIncluded;
    if (order.revisionsUsed >= included) {
      throw new HttpError(409, `Ya usaste las ${included} revisiones incluidas. Coordiná ajustes extra con el artista por el chat.`);
    }
    const next = order.status === "FINAL_PREVIEW_REVIEW" ? "WORKING_FINAL" : "IN_PROGRESS_SKETCH";
    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, order.status, next, { revisionsUsed: order.revisionsUsed + 1 });
      await tx.insert(orderMessages).values({ orderId: order.id, senderId: user.id, type: "TEXT", content: `🔄 Pedido de ajustes: ${feedback}` });
      await addSystemMessage(tx, order.id, `Revisión ${order.revisionsUsed + 1}/${included} solicitada por el comprador.`);
      return o;
    });
    void notifyOrder(updated, "artist", "El comprador pidió ajustes", feedback);
    return { ok: true, nextStatus: updated.status };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/approve-sketch
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/approve-sketch", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede aprobar");
    assertStatus(order, "SKETCH_REVIEW");
    const next = order.paymentPlanSnapshot === "SPLIT_ON_SKETCH" ? "WAITING_PAYMENT_AFTER_SKETCH" : "WORKING_FINAL";
    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "SKETCH_REVIEW", next);
      await addSystemMessage(
        tx,
        order.id,
        next === "WAITING_PAYMENT_AFTER_SKETCH"
          ? "✅ Boceto aprobado. Próximo paso: abonar el 50% restante para que el artista pase a línea y color."
          : "✅ Boceto aprobado. El artista continúa con la obra final."
      );
      return o;
    });
    void notifyOrder(updated, "artist", "¡Boceto aprobado!", next === "WAITING_PAYMENT_AFTER_SKETCH" ? "El comprador aprobó el boceto y debe abonar el 50% restante." : "El comprador aprobó el boceto. Ya podés avanzar con la obra final.");
    return { ok: true, nextStatus: updated.status };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/deliver-final — doble archivo (Plan §3.A)
  //   file    = original HD: imagen (PNG/JPG/WebP) o paquete .zip / .rar / .psd → bucket privado
  //   preview = imagen para la vista previa (obligatoria si `file` no es una imagen)
  // El original se escribe a un archivo temporal y se sube por streaming: nunca entra entero en memoria.
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/deliver-final", async (request) => {
    const user = await requireUser(request);
    const { order, artistProfile, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede entregar");
    assertStatus(order, "WORKING_FINAL");

    const tmpPath = path.join(os.tmpdir(), `tp-final-${crypto.randomUUID()}`);
    const previewKey = newKey(`orders/${order.id}/preview`, "webp");
    let hd: { filename: string; size: number } | null = null;
    let previewSource: Buffer | null = null;
    let mode = artistProfile.defaultWatermarkMode;
    let hdKey = "";
    let hdExt = "";

    try {
      for await (const part of request.parts({ limits: { fileSize: LIMITS.finalDeliveryBytes, files: 2 } })) {
        if (part.type === "file") {
          if (part.fieldname === "file" && !hd) {
            await pipeline(part.file, createWriteStream(tmpPath)).catch((err: { code?: string }) => {
              if (err?.code === "FST_REQ_FILE_TOO_LARGE") {
                throw new HttpError(413, `El archivo final supera los ${LIMITS_MB.finalDelivery} MB`);
              }
              throw err;
            });
            if (part.file.truncated) {
              throw new HttpError(413, `El archivo final supera los ${LIMITS_MB.finalDelivery} MB`);
            }
            hd = { filename: part.filename || "entrega", size: (await fsp.stat(tmpPath)).size };
          } else if (part.fieldname === "preview" && !previewSource) {
            const chunks: Buffer[] = [];
            let total = 0;
            for await (const chunk of part.file) {
              total += (chunk as Buffer).length;
              if (total > LIMITS.finalPreviewBytes) {
                throw new HttpError(413, `La imagen de vista previa supera los ${LIMITS_MB.finalPreview} MB`);
              }
              chunks.push(chunk as Buffer);
            }
            previewSource = Buffer.concat(chunks);
          } else {
            part.file.resume();
          }
        } else if (part.fieldname === "watermarkMode") {
          mode = z.enum(["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"]).catch(mode).parse(part.value);
        }
      }
      if (!hd || hd.size === 0) throw new HttpError(400, "Subí el archivo final (imagen, .zip o .rar)");

      // El formato se decide por el contenido real del archivo, no por su extensión
      const handle = await fsp.open(tmpPath, "r");
      const head = Buffer.alloc(16);
      await handle.read(head, 0, 16, 0);
      await handle.close();
      const archive = sniffArchive(head);

      let hdType: string;
      if (archive) {
        hdType = DELIVERY_FORMATS[archive].contentType;
        hdExt = DELIVERY_FORMATS[archive].ext;
      } else {
        const meta = await sharp(tmpPath).metadata().catch(() => null);
        const imageExt = ({ png: "png", jpeg: "jpg", webp: "webp" } as Record<string, string>)[meta?.format ?? ""];
        if (!meta?.width || !imageExt) {
          throw new HttpError(400, "Formato no admitido. Subí una imagen PNG, JPG o WebP, o un paquete .zip, .rar o .psd");
        }
        hdType = `image/${meta.format}`;
        hdExt = imageExt;
      }

      const source: Buffer | string | null = previewSource ?? (archive ? null : tmpPath);
      if (!source) {
        throw new HttpError(400, "Si entregás un .zip, .rar o .psd, subí también una imagen para la vista previa");
      }
      await WatermarkService.assertImage(source).catch((e: Error) => {
        throw new HttpError(400, e.message);
      });

      // Vista previa en baja resolución con marca de agua
      const preview = await WatermarkService.apply(source, {
        mode,
        username: user.username,
        customText: artistProfile.watermarkCustomText,
        avatar: mode === "AUTO_AVATAR" ? await loadAvatar(user.image) : null,
        maxWidth: 1000
      });
      hdKey = newKey(`orders/${order.id}/final`, hdExt);
      await storage.putFile("private", hdKey, tmpPath, hd.size, hdType);
      await storage.put("private", previewKey, preview, "image/webp");
    } finally {
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
    }

    // FULL_100 y SPLIT_ON_SKETCH ya están pagos al 100% → se destraba directo
    const next = order.paymentPlanSnapshot === "SPLIT_ON_FINAL_PREVIEW" ? "FINAL_PREVIEW_REVIEW" : "COMPLETED_HD_UNLOCKED";
    // El nombre de descarga lleva la extensión real detectada, no la que venía en el archivo
    const baseName =
      hd.filename
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-70) || "entrega";
    const safeName = `${order.orderNumber}-${baseName}.${hdExt}`;

    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "WORKING_FINAL", next, {
        previewWatermarkedKey: previewKey,
        finalHdPrivateKey: hdKey,
        finalHdFilename: safeName,
        ...(next === "COMPLETED_HD_UNLOCKED" ? { completedAt: new Date() } : {})
      });
      await tx.insert(orderMessages).values({
        orderId: order.id,
        senderId: user.id,
        type: "FINAL_PREVIEW_SUBMISSION",
        content:
          next === "FINAL_PREVIEW_REVIEW"
            ? "🎨 El artista subió la obra terminada (vista previa con marca de agua). Aprobala y aboná el 50% restante para desbloquear el original HD."
            : "🎉 ¡Obra final entregada! Ya podés descargar el archivo original en alta definición.",
        attachments: [previewKey]
      });
      return o;
    });
    void notifyOrder(
      updated,
      "buyer",
      next === "FINAL_PREVIEW_REVIEW" ? "Tu obra está terminada" : "¡Tu comisión está lista!",
      next === "FINAL_PREVIEW_REVIEW" ? "Revisá la vista previa, aprobala y aboná el saldo para descargar el original HD." : "Ya podés descargar tu ilustración en alta definición."
    );
    return { ok: true, nextStatus: updated.status };
  });

  // POST /api/orders/:id/approve-final-preview
  fastify.post("/:id/approve-final-preview", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede aprobar la vista previa");
    assertStatus(order, "FINAL_PREVIEW_REVIEW");
    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "FINAL_PREVIEW_REVIEW", "WAITING_PAYMENT_BEFORE_HD");
      await addSystemMessage(tx, order.id, "✅ Vista previa final aprobada. Al acreditarse el 50% restante se desbloquea el original HD sin marca de agua.");
      return o;
    });
    void notifyOrder(updated, "artist", "Vista previa aprobada", "El comprador aprobó la obra final y debe abonar el saldo.");
    return { ok: true, nextStatus: updated.status };
  });

  // ───────────────────────────────────────────────────────────
  // GET /api/orders/:id/download-hd — el link al original JAMÁS sale sin el 100% APPROVED
  // ───────────────────────────────────────────────────────────
  fastify.get("/:id/download-hd", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer, isArtist } = await loadOrderFor(request, user);
    if (!isBuyer && !isArtist) throw new HttpError(403, "No autorizado");
    if (!order.finalHdPrivateKey) throw new HttpError(404, "Todavía no hay entrega final");

    if (isBuyer) {
      const payments = await db.select().from(orderMilestonePayments).where(eq(orderMilestonePayments.orderId, order.id));
      const paid = payments.filter((p) => p.status === "APPROVED").reduce((acc, p) => acc + p.grossAmount, 0);
      if (order.status !== "COMPLETED_HD_UNLOCKED" || paid < order.totalAmount) {
        throw new HttpError(402, "El archivo HD se desbloquea cuando el 100% del pago figura acreditado");
      }
    }
    const url = await storage.signedGetUrl(order.finalHdPrivateKey, {
      expiresIn: 5 * 60,
      downloadName: order.finalHdFilename ?? `${order.orderNumber}-original`
    });
    return { url };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/orders/:id/review — reseña 1-5 (solo pedidos completados)
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/review", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede calificar");
    assertStatus(order, "COMPLETED_HD_UNLOCKED");
    const body = parseBody(
      z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() }),
      request.body
    );
    const [created] = await db
      .insert(reviews)
      .values({ orderId: order.id, artistId: order.artistId, buyerId: user.id, rating: body.rating, comment: body.comment ?? "" })
      .onConflictDoNothing({ target: reviews.orderId })
      .returning({ id: reviews.id });
    if (!created) throw new HttpError(409, "Ya calificaste este pedido");
    return { ok: true, id: created.id };
  });
}

