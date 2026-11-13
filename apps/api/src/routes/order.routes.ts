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
  orderDisputes,
  orderMessages,
  orderMilestonePayments,
  reviews,
  users
} from "../db/schema.js";
import { config } from "../config.js";
import { HttpError, parseBody, requireUser, type SessionUser } from "../lib/http.js";
import { assertStatus, loadOrderFor } from "../lib/order-access.js";
import { MAX_REFERENCE_BYTES, newKey, storage } from "../services/storage.service.js";
import { DELIVERY_FORMATS, LIMITS, LIMITS_MB, sniffArchive } from "../lib/limits.js";
import { WatermarkService } from "../services/watermark.service.js";
import { MercadoPagoService, MercadoPagoError } from "../services/mercadopago.service.js";
import { notifyDiscord, sendEmail, html } from "../services/notification.service.js";
import { loadAvatar } from "./artist.routes.js";
import { artistCanCharge, getArtistMpToken } from "../services/payments.service.js";
import {
  DISPUTE_REASON_LABEL,
  USER_DISPUTE_REASONS,
  canOpenDispute,
  getLatestDispute
} from "../services/dispute.service.js";
import {
  ARTIST_ACTION_STATUSES,
  BUYER_ACTION_STATUSES,
  BUYER_PAYMENT_STATUSES,
  PAID_ACTIVE_STATUSES,
  SLOT_STATUSES,
  addSystemMessage,
  approveFinalPreview,
  approveMilestone,
  approveSketch,
  buildOrderMilestones,
  cancelOrderTx,
  computeAmounts,
  neutralTitle,
  nextOrderNumber,
  notifyOrder,
  orderDeadlines,
  orderParties,
  pendingPayment,
  planLabel,
  platformRulesText,
  transition,
  type Order
} from "../services/order.service.js";

/** Mensajes de la otra parte (o del sistema) posteriores a la última vez que este usuario abrió el pedido */
function unreadSql(userId: string) {
  return sql<boolean>`exists (
    select 1 from ${orderMessages} m
    where m.order_id = ${commissionOrders.id}
      and (m.sender_id is null or m.sender_id <> ${userId})
      and m.created_at > coalesce(
        case when ${commissionOrders.buyerId} = ${userId} then ${commissionOrders.buyerSeenAt} else ${commissionOrders.artistSeenAt} end,
        'epoch'::timestamptz
      )
  )`;
}

/** Deja asentado que esta parte abrió la sala del pedido (no cuenta como actividad del pedido) */
async function markSeen(orderId: string, side: "buyer" | "artist") {
  await db
    .update(commissionOrders)
    .set({
      ...(side === "buyer" ? { buyerSeenAt: new Date() } : { artistSeenAt: new Date() }),
      updatedAt: sql`${commissionOrders.updatedAt}`
    })
    .where(eq(commissionOrders.id, orderId));
}

/**
 * Aviso por email de un mensaje nuevo en el hilo. Como mucho uno por "tanda": no se vuelve a
 * avisar hasta que la otra parte abra el pedido, y no se avisa si lo tiene abierto en este momento.
 */
async function notifyNewMessage(
  order: Order,
  from: "buyer" | "artist" | "staff",
  sender: SessionUser,
  content: string
) {
  try {
    const sides = from === "staff" ? (["buyer", "artist"] as const) : from === "buyer" ? (["artist"] as const) : (["buyer"] as const);
    const parties = await orderParties(order);
    for (const side of sides) {
      const seenAt = side === "buyer" ? commissionOrders.buyerSeenAt : commissionOrders.artistSeenAt;
      const notifiedAt = side === "buyer" ? commissionOrders.buyerNotifiedAt : commissionOrders.artistNotifiedAt;
      const [claimed] = await db
        .update(commissionOrders)
        .set({
          ...(side === "buyer" ? { buyerNotifiedAt: new Date() } : { artistNotifiedAt: new Date() }),
          updatedAt: sql`${commissionOrders.updatedAt}`
        })
        .where(
          and(
            eq(commissionOrders.id, order.id),
            sql`(${notifiedAt} is null or ${seenAt} > ${notifiedAt})`,
            sql`(${seenAt} is null or ${seenAt} < now() - interval '45 seconds')`
          )
        )
        .returning({ id: commissionOrders.id });
      const recipient = parties[side];
      if (!claimed || !recipient || recipient.deletedAt) continue;
      const who = from === "staff" ? "El equipo de TuPuestito" : `@${sender.username}`;
      await sendEmail({
        to: recipient.email,
        subject: `Mensaje nuevo en tu pedido · #${order.orderNumber}`,
        title: "Tenés un mensaje nuevo",
        html: `<p>Hola ${html.escape(recipient.name)},</p><p>${html.escape(who)} te escribió en el pedido #${html.escape(order.orderNumber)}:</p><blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #ddd6fe;background:#faf5ff;color:#475569">${html.escape(content.slice(0, 300))}${content.length > 300 ? "…" : ""}</blockquote><p style="font-size:12px;color:#64748b">No te vamos a avisar de cada mensaje: el próximo aviso llega después de que abras el pedido.</p>`,
        cta: { label: "Responder en la sala del pedido", url: `${config.WEB_URL}/orders/${order.id}` }
      });
    }
  } catch (err) {
    console.error("[notify] No se pudo avisar del mensaje nuevo", order.orderNumber, err);
  }
}

function multipartField(file: MultipartFile, name: string): string | undefined {
  const f = (file.fields as Record<string, { value?: unknown } | undefined>)[name];
  return typeof f?.value === "string" ? f.value : undefined;
}

async function signAll(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map((k) => storage.signedGetUrl(k)));
}

/**
 * Recibe la entrega final (multipart): original HD (imagen, .zip, .rar o .psd) + imagen de vista previa.
 * Guarda el original en el bucket privado por streaming y genera la vista previa con marca de agua.
 */
async function receiveFinalDelivery(
  request: FastifyRequest,
  order: Order,
  artistProfile: typeof artistProfiles.$inferSelect,
  user: SessionUser
): Promise<{ hdKey: string; previewKey: string; safeName: string }> {
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

  // El nombre de descarga lleva la extensión real detectada, no la que venía en el archivo
  const baseName =
    hd.filename
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-70) || "entrega";
  const safeName = `${order.orderNumber}-${baseName}.${hdExt}`;
  return { hdKey, previewKey, safeName };
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
    if (!row || row.service.moderatedAt || row.artistUser.suspendedAt || row.artistUser.deletedAt) {
      throw new HttpError(404, "Servicio de comisión no encontrado");
    }
    const { service, profile, artistUser } = row;

    if (artistUser.id === user.id) throw new HttpError(400, "No podés encargarte una comisión a vos mismo/a");
    if (profile.commissionStatus === "CLOSED") throw new HttpError(409, "El artista tiene las comisiones cerradas");
    // Plan §2: el contenido +18 es solo para quien declaró ser mayor de edad
    if (service.rating === "NSFW" && !user.showNsfw) {
      throw new HttpError(403, "Esta comisión es +18. Activá el contenido adulto en tu cuenta (confirmando que sos mayor de edad) para poder pedirla.");
    }

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
    if (service.paymentPlan === "MILESTONES" && service.milestones.length < 2) {
      throw new HttpError(409, "Este servicio tiene el plan de etapas incompleto. Avisale al artista.");
    }
    const milestonesSnapshot =
      service.paymentPlan === "MILESTONES" ? buildOrderMilestones(service.milestones, totalAmount) : [];
    const amounts = computeAmounts(service.paymentPlan, totalAmount, milestonesSnapshot);
    const agreedPlan = planLabel(service.paymentPlan, milestonesSnapshot);
    const termsSnapshot = [
      `Términos de Servicio de @${artistUser.username}:`,
      profile.termsOfService?.trim() || "(El artista no publicó términos propios; aplican los Términos de TuPuestito.)",
      "",
      `Modalidad de pago aceptada: ${agreedPlan}.`,
      service.paymentPlan === "MILESTONES"
        ? "El comprador entiende que el pago de cada etapa no es reembolsable una vez entregada esa etapa."
        : "El comprador entiende que la seña inicial no es reembolsable una vez entregado el boceto.",
      "",
      platformRulesText()
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
          milestonesSnapshot,
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
        `📝 Solicitud #${orderNumber} enviada con ${refs.length} referencia(s). Modalidad pactada: ${agreedPlan}. Esperando que el artista acepte el pedido.`
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
        artistUsername: users.username,
        unread: unreadSql(user.id)
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
      orders: rows.map((r) => {
        const role = r.order.buyerId === user.id ? ("BUYER" as const) : ("ARTIST" as const);
        return {
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
          role,
          // "Te toca a vos": la próxima acción del pedido es de este usuario
          awaitingMe: (role === "BUYER" ? BUYER_ACTION_STATUSES : ARTIST_ACTION_STATUSES).includes(r.order.status),
          unread: Boolean(r.unread),
          workDueAt: orderDeadlines(r.order).workDueAt
        };
      })
    };
  });

  // ───────────────────────────────────────────────────────────
  // GET /api/orders/:id — sala del pedido
  // ───────────────────────────────────────────────────────────
  fastify.get("/:id", async (request) => {
    const user = await requireUser(request);
    const { order, artistProfile, isBuyer, isArtist, isAdmin } = await loadOrderFor(request, user);
    if (isBuyer || isArtist) await markSeen(order.id, isBuyer ? "buyer" : "artist");
    const dispute = await getLatestDispute(order.id);
    const openDispute = dispute?.status === "OPEN" ? dispute : null;
    // Con un reclamo abierto, el flujo se muestra según el estado en que quedó en pausa
    const flowStatus = order.status === "DISPUTED" && openDispute ? openDispute.statusBefore : order.status;
    const role = isBuyer ? "BUYER" : isArtist ? "ARTIST" : null;

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
          milestoneIndex: orderMilestonePayments.milestoneIndex,
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
    const paidAmount = payments.filter((p) => p.status === "APPROVED").reduce((acc, p) => acc + p.grossAmount, 0);
    // El original solo está disponible con el pedido completado Y el 100% todavía acreditado
    const hdUnlocked = order.status === "COMPLETED_HD_UNLOCKED" && paidAmount >= order.totalAmount;
    const deadlines = orderDeadlines(order);
    const proposalIds = openDispute?.proposedRefundPaymentIds ?? null;

    const {
      finalHdPrivateKey,
      sketchWatermarkedKey,
      previewWatermarkedKey,
      referenceImages,
      buyerSeenAt: _buyerSeenAt,
      artistSeenAt: _artistSeenAt,
      buyerNotifiedAt: _buyerNotifiedAt,
      artistNotifiedAt: _artistNotifiedAt,
      reminderStage: _reminderStage,
      ...rest
    } = order;
    return {
      order: {
        ...rest,
        // Estado del flujo sin contar la pausa del reclamo (para el paso a paso)
        flowStatus,
        referenceImages: await signAll(referenceImages),
        sketchWatermarkedUrl: sketchWatermarkedKey ? await storage.signedGetUrl(sketchWatermarkedKey) : null,
        previewWatermarkedUrl: previewWatermarkedKey ? await storage.signedGetUrl(previewWatermarkedKey) : null,
        hasFinalHd: Boolean(finalHdPrivateKey),
        hdUnlocked
      },
      nextPayment: (() => {
        const p = pendingPayment(order);
        return p ? { stage: p.stage, milestoneIndex: p.milestoneIndex, amount: p.amount } : null;
      })(),
      depositExpiresAt: deadlines.depositExpiresAt,
      // Fechas límite del estado actual: vencimientos, aprobación automática y entrega estimada
      deadlines,
      // Plan por etapas: estado de cada una, derivado del pedido y de sus pagos
      milestones: order.milestonesSnapshot.map((m, i) => {
        const paid = payments.some((p) => p.stage === "MILESTONE" && p.milestoneIndex === i && p.status === "APPROVED");
        const state =
          flowStatus === "COMPLETED_HD_UNLOCKED" || i < order.currentMilestone
            ? "APPROVED"
            : i > order.currentMilestone || ["REQUESTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(flowStatus)
            ? "UPCOMING"
            : flowStatus === "MILESTONE_REVIEW"
            ? "IN_REVIEW"
            : flowStatus === "MILESTONE_IN_PROGRESS"
            ? "IN_PROGRESS"
            : paid
            ? "IN_PROGRESS"
            : "WAITING_PAYMENT";
        return { ...m, index: i, paid, state };
      }),
      // Reclamo abierto o, si ya se cerró, cómo terminó el último
      dispute: dispute
        ? {
            id: dispute.id,
            status: dispute.status,
            reason: dispute.reason,
            reasonLabel: DISPUTE_REASON_LABEL[dispute.reason],
            description: dispute.description,
            openerRole: dispute.openerRole,
            openedByMe: dispute.openedById === user.id,
            statusBefore: dispute.statusBefore,
            createdAt: dispute.createdAt,
            proposal: proposalIds
              ? {
                  paymentIds: proposalIds,
                  amount: payments.filter((p) => proposalIds.includes(p.id)).reduce((acc, p) => acc + p.grossAmount, 0),
                  proposedAt: dispute.proposedAt
                }
              : null,
            resolution: dispute.resolution,
            resolutionNote: dispute.resolutionNote,
            resolvedAt: dispute.resolvedAt
          }
        : null,
      // Qué puede hacer este usuario ahora mismo para destrabar el pedido
      permissions: {
        canOpenDispute: Boolean(role) && order.status !== "DISPUTED" && canOpenDispute(order, role!),
        disputeReasons: role ? USER_DISPUTE_REASONS[role].map((r) => ({ value: r, label: DISPUTE_REASON_LABEL[r] })) : [],
        canWithdrawDispute: Boolean(openDispute && openDispute.openedById === user.id),
        canRefund: isArtist && paidAmount > 0 && (order.status === "DISPUTED" || PAID_ACTIVE_STATUSES.includes(order.status)),
        canProposePartialRefund: isArtist && order.status === "DISPUTED" && paidAmount > 0,
        canAnswerProposal: isBuyer && Boolean(proposalIds),
        canCloseUnpaid:
          isArtist &&
          BUYER_PAYMENT_STATUSES.includes(order.status) &&
          Boolean(deadlines.paymentTimeoutAt && deadlines.paymentTimeoutAt <= new Date())
      },
      paidAmount,
      buyer,
      artist: { id: artistProfile.id, ...artistUser, defaultWatermarkMode: artistProfile.defaultWatermarkMode },
      isBuyer,
      isArtist,
      // Moderación mirando un pedido ajeno
      isStaffView: isAdmin && !isBuyer && !isArtist,
      currentUserId: user.id,
      supportEmail: config.SUPPORT_EMAIL,
      messages: signedMessages,
      payments,
      review: review ?? null
    };
  });

  // ───────────────────────────────────────────────────────────
  // GET /api/orders/:id/pulse — huella liviana del pedido: la sala la consulta cada pocos segundos
  // y solo vuelve a pedir el detalle (con sus URLs firmadas) cuando algo cambió.
  // ───────────────────────────────────────────────────────────
  fastify.get("/:id/pulse", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer, isArtist } = await loadOrderFor(request, user);
    if (isBuyer || isArtist) await markSeen(order.id, isBuyer ? "buyer" : "artist");
    const [[messages], payments, [dispute]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int`, last: sql<string | null>`max(${orderMessages.createdAt})::text` })
        .from(orderMessages)
        .where(eq(orderMessages.orderId, order.id)),
      db
        .select({ id: orderMilestonePayments.id, status: orderMilestonePayments.status })
        .from(orderMilestonePayments)
        .where(eq(orderMilestonePayments.orderId, order.id))
        .orderBy(asc(orderMilestonePayments.createdAt)),
      db
        .select({ last: sql<string | null>`max(${orderDisputes.updatedAt})::text` })
        .from(orderDisputes)
        .where(eq(orderDisputes.orderId, order.id))
    ]);
    return {
      version: [
        order.status,
        order.statusChangedAt.getTime(),
        order.revisionsUsed,
        messages?.n ?? 0,
        messages?.last ?? "",
        payments.map((p) => p.status.slice(0, 3)).join(""),
        dispute?.last ?? ""
      ].join("|")
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
    // Sin Mercado Pago vinculado el comprador no podría pagar y el pedido vencería solo
    if (!(await artistCanCharge(order.artistId))) {
      throw new HttpError(409, "Antes de aceptar pedidos tenés que vincular tu cuenta de Mercado Pago desde tu panel.");
    }

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
    // Antes de cualquier pago se cancela libremente. Con un pago acreditado, la salida es un
    // reembolso del artista o un reclamo (ver order-resolution.routes.ts).
    if (order.status !== "REQUESTED" && order.status !== "ACCEPTED_WAITING_DEPOSIT") {
      throw new HttpError(
        409,
        isArtist
          ? "Este pedido ya tiene pagos acreditados. Podés cancelarlo reembolsando lo cobrado, o abrir un reclamo si hay un problema."
          : "Este pedido ya tiene pagos acreditados. Para cancelarlo, abrí un reclamo desde la sala del pedido y acordalo con el artista."
      );
    }
    const updated = await db.transaction((tx) =>
      cancelOrderTx(
        tx,
        order.id,
        ["REQUESTED", "ACCEPTED_WAITING_DEPOSIT"],
        `🚫 El pedido fue cancelado por ${isArtist ? "el artista" : "el comprador"} antes de cualquier pago.`
      )
    );
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
    const pending = pendingPayment(order);
    if (!pending) throw new HttpError(409, "No hay ningún pago pendiente en este momento");
    const { stage, amount, fee, milestoneIndex } = pending;

    const [existing] = await db
      .select()
      .from(orderMilestonePayments)
      .where(
        and(
          eq(orderMilestonePayments.orderId, order.id),
          eq(orderMilestonePayments.stage, stage),
          eq(orderMilestonePayments.milestoneIndex, milestoneIndex)
        )
      )
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
          .values({ orderId: order.id, stage, milestoneIndex, provider: "MERCADOPAGO", grossAmount: amount, marketplaceFee: fee })
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
        title: neutralTitle(order.orderNumber, artistUser?.username ?? "artista", pending.concept),
        amountArs: amount,
        marketplaceFeeArs: fee,
        payerEmail: user.email,
        expiresAt:
          order.status === "ACCEPTED_WAITING_DEPOSIT" && order.acceptedAt
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
    const { order, isBuyer, isArtist, isAdmin } = await loadOrderFor(request, user);
    // Moderación puede intervenir en el hilo (por ejemplo, para mediar en un reclamo)
    const isStaff = isAdmin && !isBuyer && !isArtist;
    if (!isBuyer && !isArtist && !isStaff) throw new HttpError(403, "Solo los participantes pueden escribir");
    if (!isStaff && ["REJECTED", "EXPIRED", "CANCELLED"].includes(order.status)) {
      throw new HttpError(409, "El hilo de este pedido está cerrado");
    }
    const { content } = parseBody(z.object({ content: z.string().trim().min(1).max(4000) }), request.body);
    const [msg] = await db
      .insert(orderMessages)
      .values({ orderId: order.id, senderId: user.id, type: "TEXT", content: isStaff ? `🛡️ Equipo de TuPuestito: ${content}` : content })
      .returning({ id: orderMessages.id });
    await db.update(commissionOrders).set({ updatedAt: new Date() }).where(eq(commissionOrders.id, order.id));
    void notifyNewMessage(order, isStaff ? "staff" : isBuyer ? "buyer" : "artist", user, content);
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
    assertStatus(order, "SKETCH_REVIEW", "FINAL_PREVIEW_REVIEW", "MILESTONE_REVIEW");
    const { feedback } = parseBody(z.object({ feedback: z.string().trim().min(3).max(2000) }), request.body);

    const included = order.serviceSnapshot.revisionsIncluded;
    if (order.revisionsUsed >= included) {
      throw new HttpError(409, `Ya usaste las ${included} revisiones incluidas. Coordiná ajustes extra con el artista por el chat.`);
    }
    const next =
      order.status === "FINAL_PREVIEW_REVIEW"
        ? "WORKING_FINAL"
        : order.status === "MILESTONE_REVIEW"
        ? "MILESTONE_IN_PROGRESS"
        : "IN_PROGRESS_SKETCH";
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
    const updated = await approveSketch(order);
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

    const { hdKey, previewKey, safeName } = await receiveFinalDelivery(request, order, artistProfile, user);

    // FULL_100 y SPLIT_ON_SKETCH ya están pagos al 100% → se destraba directo
    const next = order.paymentPlanSnapshot === "SPLIT_ON_FINAL_PREVIEW" ? "FINAL_PREVIEW_REVIEW" : "COMPLETED_HD_UNLOCKED";

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

  // ───────────────────────────────────────────────────────────
  // Plan MILESTONES — POST /api/orders/:id/milestones/deliver
  //   Etapas intermedias: una imagen de avance (se muestra con marca de agua).
  //   Última etapa: la entrega final (original HD o paquete + vista previa), igual que deliver-final.
  // ───────────────────────────────────────────────────────────
  fastify.post("/:id/milestones/deliver", async (request) => {
    const user = await requireUser(request);
    const { order, artistProfile, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede entregar una etapa");
    assertStatus(order, "MILESTONE_IN_PROGRESS");

    const index = order.currentMilestone;
    const total = order.milestonesSnapshot.length;
    const milestone = order.milestonesSnapshot[index];
    if (!milestone) throw new HttpError(409, "El pedido no tiene esa etapa");
    const isLast = index === total - 1;

    let attachmentKey: string;
    let extra: Partial<typeof commissionOrders.$inferInsert> = {};
    if (isLast) {
      const delivery = await receiveFinalDelivery(request, order, artistProfile, user);
      attachmentKey = delivery.previewKey;
      extra = {
        previewWatermarkedKey: delivery.previewKey,
        finalHdPrivateKey: delivery.hdKey,
        finalHdFilename: delivery.safeName
      };
    } else {
      const file = await request.file({ limits: { fileSize: LIMITS.sketchBytes } });
      if (!file) throw new HttpError(400, "Archivo requerido");
      const buffer = await file.toBuffer().catch(() => null);
      if (!buffer || file.file.truncated) throw new HttpError(413, `El avance supera los ${LIMITS_MB.sketch} MB`);
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
      attachmentKey = newKey(`orders/${order.id}/milestone-${index + 1}`, "webp");
      await storage.put("private", attachmentKey, watermarked, "image/webp");
    }

    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "MILESTONE_IN_PROGRESS", "MILESTONE_REVIEW", extra);
      await tx.insert(orderMessages).values({
        orderId: order.id,
        senderId: user.id,
        type: "MILESTONE_SUBMISSION",
        content: isLast
          ? `🎨 El artista entregó la etapa final (${index + 1}/${total}: "${milestone.title}"). Revisá la vista previa con marca de agua; al aprobarla se desbloquea el original.`
          : `📦 El artista entregó la etapa ${index + 1}/${total}: "${milestone.title}". Revisala y aprobala para pasar a la siguiente.`,
        attachments: [attachmentKey]
      });
      return o;
    });
    void notifyOrder(updated, "buyer", `Etapa ${index + 1} de ${total} lista para revisar`, `El artista entregó "${milestone.title}". Aprobala o pedí ajustes desde la sala del pedido.`);
    return { ok: true, status: updated.status };
  });

  // POST /api/orders/:id/milestones/approve — el comprador aprueba la etapa en revisión
  fastify.post("/:id/milestones/approve", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede aprobar una etapa");
    assertStatus(order, "MILESTONE_REVIEW");
    const updated = await approveMilestone(order);
    return { ok: true, nextStatus: updated.status };
  });

  // POST /api/orders/:id/approve-final-preview
  fastify.post("/:id/approve-final-preview", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede aprobar la vista previa");
    assertStatus(order, "FINAL_PREVIEW_REVIEW");
    const updated = await approveFinalPreview(order);
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

