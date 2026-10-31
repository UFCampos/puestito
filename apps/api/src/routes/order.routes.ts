import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import {
  commissionOrders,
  commissionServices,
  artistProfiles,
  orderMilestonePayments,
  orderMessages,
  paymentAccounts,
  users,
  reviews
} from "../db/schema.js";
import { eq, and, or, desc } from "drizzle-orm";
import { MercadoPagoService } from "../services/mercadopago.service.js";
import { WatermarkService } from "../services/watermark.service.js";

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /api/orders — Crear nueva solicitud de comisión (Comprador)
  fastify.post("/", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { serviceId, buyerBrief, referenceImages, externalBoardUrl } = request.body as any;

    if (!serviceId || !buyerBrief) {
      return reply.status(400).send({ error: "Servicio y descripción requeridos" });
    }

    const service = db.select().from(commissionServices).where(eq(commissionServices.id, serviceId)).get();
    if (!service) {
      return reply.status(404).send({ error: "Servicio de comisión no encontrado" });
    }

    const artist = db.select().from(artistProfiles).where(eq(artistProfiles.id, service.artistId)).get();
    if (!artist) {
      return reply.status(404).send({ error: "Artista no encontrado" });
    }

    const orderId = crypto.randomUUID();
    const orderNumber = `PST-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const totalAmount = service.priceArs;
    const platformFeeAmount = Math.round(totalAmount * 0.05); // 5%

    // Desglose según paymentPlan
    let depositAmount = totalAmount;
    let finalAmount = 0;
    if (service.paymentPlan === "SPLIT_ON_SKETCH" || service.paymentPlan === "SPLIT_ON_FINAL_PREVIEW") {
      depositAmount = Math.round(totalAmount * 0.5);
      finalAmount = totalAmount - depositAmount;
    }

    db.insert(commissionOrders)
      .values({
        id: orderId,
        orderNumber,
        buyerId: decoded.id,
        artistId: artist.id,
        serviceId: service.id,
        status: "REQUESTED",
        paymentPlanSnapshot: service.paymentPlan,
        termsSnapshot: artist.termsOfService || "Términos estándar de TuPuestito",
        termsAcceptedAt: now,
        currency: "ARS",
        totalAmount,
        platformFeeAmount,
        depositAmount,
        finalAmount,
        buyerBrief,
        referenceImages: JSON.stringify(referenceImages || []),
        externalBoardUrl: externalBoardUrl || null,
        createdAt: now
      })
      .run();

    // Mensaje inicial del sistema en el hilo
    db.insert(orderMessages)
      .values({
        id: crypto.randomUUID(),
        orderId,
        senderId: decoded.id,
        type: "SYSTEM_EVENT",
        content: `Solicitud #${orderNumber} enviada por el comprador. Esperando que el artista acepte el pedido.`,
        createdAt: now
      })
      .run();

    return { id: orderId, orderNumber };
  });

  // GET /api/orders — Listar pedidos del usuario autenticado (como comprador o artista)
  fastify.get("/", async (request) => {
    const decoded = (await request.jwtVerify()) as any;
    const userProfile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, decoded.id)).get();

    let orders;
    if (userProfile) {
      orders = db
        .select()
        .from(commissionOrders)
        .where(or(eq(commissionOrders.buyerId, decoded.id), eq(commissionOrders.artistId, userProfile.id)))
        .orderBy(desc(commissionOrders.createdAt))
        .all();
    } else {
      orders = db
        .select()
        .from(commissionOrders)
        .where(eq(commissionOrders.buyerId, decoded.id))
        .orderBy(desc(commissionOrders.createdAt))
        .all();
    }

    return { orders };
  });

  // GET /api/orders/:id — Detalle completo de la sala del pedido
  fastify.get("/:id", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) {
      return reply.status(404).send({ error: "Pedido no encontrado" });
    }

    const artistProfile = db.select().from(artistProfiles).where(eq(artistProfiles.id, order.artistId)).get();
    const isBuyer = order.buyerId === decoded.id;
    const isArtist = artistProfile?.userId === decoded.id;

    if (!isBuyer && !isArtist && decoded.role !== "ADMIN") {
      return reply.status(403).send({ error: "No tenés acceso a este pedido" });
    }

    const service = db.select().from(commissionServices).where(eq(commissionServices.id, order.serviceId)).get();
    const buyer = db.select().from(users).where(eq(users.id, order.buyerId)).get();
    const artistUser = artistProfile ? db.select().from(users).where(eq(users.id, artistProfile.userId)).get() : null;

    const messages = db
      .select({
        id: orderMessages.id,
        type: orderMessages.type,
        content: orderMessages.content,
        attachments: orderMessages.attachments,
        createdAt: orderMessages.createdAt,
        senderId: orderMessages.senderId,
        senderName: users.displayName,
        senderAvatar: users.avatarUrl
      })
      .from(orderMessages)
      .innerJoin(users, eq(orderMessages.senderId, users.id))
      .where(eq(orderMessages.orderId, id))
      .orderBy(orderMessages.createdAt)
      .all();

    const payments = db
      .select()
      .from(orderMilestonePayments)
      .where(eq(orderMilestonePayments.orderId, id))
      .all();

    const review = db.select().from(reviews).where(eq(reviews.orderId, id)).get();

    return {
      order,
      service,
      buyer: { id: buyer?.id, displayName: buyer?.displayName, username: buyer?.username },
      artist: { id: artistProfile?.id, displayName: artistUser?.displayName, username: artistUser?.username },
      isBuyer,
      isArtist,
      messages,
      payments,
      review
    };
  });

  // POST /api/orders/:id/accept — Artista acepta pedido
  fastify.post("/:id/accept", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });

    const artistProfile = db.select().from(artistProfiles).where(eq(artistProfiles.id, order.artistId)).get();
    if (artistProfile?.userId !== decoded.id) {
      return reply.status(403).send({ error: "Solo el artista puede aceptar este pedido" });
    }

    db.update(commissionOrders)
      .set({ status: "ACCEPTED_WAITING_DEPOSIT" })
      .where(eq(commissionOrders.id, id))
      .run();

    db.insert(orderMessages)
      .values({
        id: crypto.randomUUID(),
        orderId: id,
        senderId: decoded.id,
        type: "SYSTEM_EVENT",
        content: "El artista aceptó la comisión. El comprador ahora puede abonar la seña para comenzar.",
        createdAt: new Date().toISOString()
      })
      .run();

    return { ok: true, status: "ACCEPTED_WAITING_DEPOSIT" };
  });

  // POST /api/orders/:id/checkout — Iniciar pago de hito (Seña o Pago Final)
  fastify.post("/:id/checkout", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;
    const { stage } = request.body as any; // "DEPOSIT_50", "FINAL_50", "FULL_100"

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    if (order.buyerId !== decoded.id) {
      return reply.status(403).send({ error: "Solo el comprador puede abonar" });
    }

    const artistAccount = db
      .select()
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.artistId, order.artistId), eq(paymentAccounts.isActive, true)))
      .get();

    let decryptedToken = "";
    if (artistAccount) {
      try {
        decryptedToken = MercadoPagoService.decryptToken(artistAccount.accessTokenEnc);
      } catch (err) {
        console.warn("Token no descifrable, usando modo sandbox:", err);
      }
    }

    const isFull = order.paymentPlanSnapshot === "FULL_100";
    const amount = stage === "FINAL_50" ? order.finalAmount : order.depositAmount;
    const fee = Math.round(amount * 0.05);

    const preference = await MercadoPagoService.createSplitPreference({
      orderId: order.id,
      orderNumber: order.orderNumber,
      title: `Ilustración ${order.orderNumber} (${stage === "FINAL_50" ? "Pago Final" : "Seña"})`,
      unitPriceArs: amount,
      marketplaceFeeArs: fee,
      artistAccessToken: decryptedToken,
      notificationUrl: "http://localhost:4000/api/payments/webhook"
    });

    const paymentId = crypto.randomUUID();
    db.insert(orderMilestonePayments)
      .values({
        id: paymentId,
        orderId: order.id,
        stage: stage || (isFull ? "FULL_100" : "DEPOSIT_50"),
        provider: "MERCADOPAGO",
        grossAmount: amount,
        marketplaceFee: fee,
        mpPreferenceId: preference.id,
        status: "PENDING",
        createdAt: new Date().toISOString()
      })
      .run();

    return {
      initPoint: preference.initPoint,
      paymentId
    };
  });

  // POST /api/orders/:id/messages — Enviar mensaje en el hilo del pedido
  fastify.post("/:id/messages", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;
    const { content, type, attachments } = request.body as any;

    if (!content && !attachments) {
      return reply.status(400).send({ error: "Contenido requerido" });
    }

    const messageId = crypto.randomUUID();
    db.insert(orderMessages)
      .values({
        id: messageId,
        orderId: id,
        senderId: decoded.id,
        type: type || "TEXT",
        content: content || "",
        attachments: attachments ? JSON.stringify(attachments) : null,
        createdAt: new Date().toISOString()
      })
      .run();

    return { id: messageId, ok: true };
  });

  // POST /api/orders/:id/sketch — Artista sube boceto (con marca de agua)
  fastify.post("/:id/sketch", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });

    const artistProfile = db.select().from(artistProfiles).where(eq(artistProfiles.id, order.artistId)).get();
    if (artistProfile?.userId !== decoded.id) {
      return reply.status(403).send({ error: "Solo el artista puede subir bocetos" });
    }

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "Archivo requerido" });

    const buffer = await data.toBuffer();
    const watermarkMode = (artistProfile?.defaultWatermarkMode as any) || "AUTO_TEXT";
    const customText = artistProfile?.watermarkCustomText || "TuPuestito • BOCETO";

    const watermarked = await WatermarkService.processImage(buffer, {
      mode: watermarkMode,
      customText: customText
    });

    const sketchUrl = await WatermarkService.saveUpload(watermarked, "webp");

    db.update(commissionOrders)
      .set({
        sketchWatermarkedUrl: sketchUrl,
        status: "SKETCH_REVIEW"
      })
      .where(eq(commissionOrders.id, id))
      .run();

    db.insert(orderMessages)
      .values({
        id: crypto.randomUUID(),
        orderId: id,
        senderId: decoded.id,
        type: "SKETCH_SUBMISSION",
        content: "El artista subió una propuesta de boceto para tu revisión.",
        attachments: JSON.stringify([sketchUrl]),
        createdAt: new Date().toISOString()
      })
      .run();

    return { ok: true, sketchUrl };
  });

  // POST /api/orders/:id/approve-sketch — Comprador aprueba el boceto
  fastify.post("/:id/approve-sketch", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    if (order.buyerId !== decoded.id) {
      return reply.status(403).send({ error: "Solo el comprador puede aprobar" });
    }

    let nextStatus: any = "WORKING_FINAL";
    if (order.paymentPlanSnapshot === "SPLIT_ON_SKETCH") {
      nextStatus = "WAITING_PAYMENT_AFTER_SKETCH";
    }

    db.update(commissionOrders).set({ status: nextStatus }).where(eq(commissionOrders.id, id)).run();

    db.insert(orderMessages)
      .values({
        id: crypto.randomUUID(),
        orderId: id,
        senderId: decoded.id,
        type: "SYSTEM_EVENT",
        content: `Boceto aprobado por el comprador. Próximo paso: ${
          nextStatus === "WAITING_PAYMENT_AFTER_SKETCH"
            ? "Abonar el 50% restante para finalizar la obra."
            : "El artista continúa trabajando en el arte final."
        }`,
        createdAt: new Date().toISOString()
      })
      .run();

    return { ok: true, nextStatus };
  });

  // POST /api/orders/:id/deliver-final — Artista sube entrega final (Preview + Archivo HD)
  fastify.post("/:id/deliver-final", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });

    const artistProfile = db.select().from(artistProfiles).where(eq(artistProfiles.id, order.artistId)).get();
    if (artistProfile?.userId !== decoded.id) {
      return reply.status(403).send({ error: "Solo el artista puede entregar" });
    }

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "Archivo requerido" });

    const buffer = await data.toBuffer();

    // 1. Guardar archivo original HD
    const hdUrl = await WatermarkService.saveUpload(buffer, "png");

    // 2. Generar preview con marca de agua
    const watermarkMode = (artistProfile?.defaultWatermarkMode as any) || "AUTO_TEXT";
    const customText = artistProfile?.watermarkCustomText || "TuPuestito • MUESTRA FINAL";

    const watermarked = await WatermarkService.processImage(buffer, {
      mode: watermarkMode,
      customText: customText
    });
    const previewUrl = await WatermarkService.saveUpload(watermarked, "webp");

    let nextStatus: any = "COMPLETED_HD_UNLOCKED";
    if (order.paymentPlanSnapshot === "SPLIT_ON_FINAL_PREVIEW") {
      nextStatus = "FINAL_PREVIEW_REVIEW";
    }

    db.update(commissionOrders)
      .set({
        previewWatermarkedUrl: previewUrl,
        finalHdPrivateKey: hdUrl,
        status: nextStatus
      })
      .where(eq(commissionOrders.id, id))
      .run();

    db.insert(orderMessages)
      .values({
        id: crypto.randomUUID(),
        orderId: id,
        senderId: decoded.id,
        type: "FINAL_PREVIEW_SUBMISSION",
        content:
          nextStatus === "FINAL_PREVIEW_REVIEW"
            ? "El artista subió la vista previa de la obra terminada. Revisala y aprobá para abonar el saldo y descargar en alta calidad."
            : "¡Obra final entregada! Podés descargar tus archivos en alta definición.",
        attachments: JSON.stringify([previewUrl]),
        createdAt: new Date().toISOString()
      })
      .run();

    return { ok: true, nextStatus };
  });

  // POST /api/orders/:id/review — Comprador deja reseña de 1 a 5 estrellas
  fastify.post("/:id/review", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const { id } = request.params as any;
    const { rating, comment } = request.body as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, id)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    if (order.buyerId !== decoded.id) {
      return reply.status(403).send({ error: "Solo el comprador puede calificar" });
    }

    const reviewId = crypto.randomUUID();
    db.insert(reviews)
      .values({
        id: reviewId,
        orderId: id,
        artistId: order.artistId,
        buyerId: decoded.id,
        rating: Number(rating) || 5,
        comment: comment || "",
        createdAt: new Date().toISOString()
      })
      .run();

    return { ok: true, id: reviewId };
  });
}
