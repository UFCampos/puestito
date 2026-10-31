import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import {
  orderMilestonePayments,
  commissionOrders,
  orderMessages,
  paymentAccounts,
  artistProfiles
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { MercadoPagoService } from "../services/mercadopago.service.js";

export async function paymentRoutes(fastify: FastifyInstance) {
  // GET /api/payments/mock-checkout — Pantalla de checkout interactiva para desarrollo
  fastify.get("/mock-checkout", async (request, reply) => {
    const { pref_id, order_id } = request.query as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, order_id)).get();
    if (!order) {
      return reply.type("text/html").send("<h1>Error: Pedido no encontrado</h1>");
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Mercado Pago Sandbox • TuPuestito</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #009ee3; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 2rem; border-radius: 12px; max-width: 420px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
          .btn { background: #009ee3; color: white; border: none; padding: 0.8rem 1.5rem; font-size: 1rem; border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold; margin-top: 1rem; }
          .btn:hover { background: #007eb5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2 style="margin-top: 0; color: #333;">Mercado Pago (Split Checkout Sandbox)</h2>
          <p><strong>Pedido:</strong> ${order.orderNumber}</p>
          <p><strong>Total en ARS:</strong> $${order.totalAmount.toLocaleString("es-AR")}</p>
          <p style="font-size: 0.9rem; color: #666;">
            TuPuestito retiene el 5% ($${Math.round(order.totalAmount * 0.05).toLocaleString("es-AR")}) en concepto de <em>marketplace_fee</em> y el 95% se acredita directo al artista.
          </p>
          <form method="POST" action="/api/payments/mock-approve">
            <input type="hidden" name="orderId" value="${order.id}" />
            <input type="hidden" name="prefId" value="${pref_id}" />
            <button type="submit" class="btn">💳 Pagar ahora (Simular Aprobación)</button>
          </form>
        </div>
      </body>
      </html>
    `;

    return reply.type("text/html").send(html);
  });

  // POST /api/payments/mock-approve — Procesa la simulación de pago aprobado
  fastify.post("/mock-approve", async (request, reply) => {
    const { orderId, prefId } = request.body as any;

    const order = db.select().from(commissionOrders).where(eq(commissionOrders.id, orderId)).get();
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });

    const payment = db
      .select()
      .from(orderMilestonePayments)
      .where(and(eq(orderMilestonePayments.orderId, orderId), eq(orderMilestonePayments.mpPreferenceId, prefId)))
      .get();

    const now = new Date().toISOString();
    const mpPaymentId = `MP_PAY_${Math.floor(100000 + Math.random() * 900000)}`;

    if (payment) {
      db.update(orderMilestonePayments)
        .set({
          status: "APPROVED",
          mpPaymentId,
          paidAt: now
        })
        .where(eq(orderMilestonePayments.id, payment.id))
        .run();
    }

    // Determinar siguiente estado según la etapa que se pagó
    let nextStatus = order.status;
    let eventMessage = "";

    if (order.status === "ACCEPTED_WAITING_DEPOSIT") {
      nextStatus = "IN_PROGRESS_SKETCH";
      eventMessage = "Pago de seña recibido correctamente vía Mercado Pago. El artista comenzó a trabajar en el boceto.";
    } else if (order.status === "WAITING_PAYMENT_AFTER_SKETCH") {
      nextStatus = "WORKING_FINAL";
      eventMessage = "Segundo pago (50%) acreditado. El artista continúa trabajando en el arte final.";
    } else if (order.status === "WAITING_PAYMENT_BEFORE_HD" || order.status === "FINAL_PREVIEW_REVIEW") {
      nextStatus = "COMPLETED_HD_UNLOCKED";
      eventMessage = "Pago final acreditado. ¡Archivos originales en HD desbloqueados para el comprador!";
    }

    db.update(commissionOrders).set({ status: nextStatus }).where(eq(commissionOrders.id, orderId)).run();

    db.insert(orderMessages)
      .values({
        id: crypto.randomUUID(),
        orderId,
        senderId: order.buyerId,
        type: "SYSTEM_EVENT",
        content: `💳 Pago #${mpPaymentId} APROBADO. ${eventMessage}`,
        createdAt: now
      })
      .run();

    return reply.redirect(`http://localhost:3000/orders/${orderId}?payment=success`);
  });

  // POST /api/payments/webhook — Webhook real de Mercado Pago (IPN)
  fastify.post("/webhook", async (request, reply) => {
    const query = request.query as any;
    const body = request.body as any;

    const topic = query.topic || body.type;
    const paymentId = query.id || body.data?.id;

    if (topic === "payment" && paymentId) {
      console.log(`[Mercado Pago Webhook] Notificación de pago recibida: ${paymentId}`);
    }

    return reply.status(200).send({ received: true });
  });

  // POST /api/payments/connect-mp — Conectar cuenta de Mercado Pago del artista (OAuth o Simulado)
  fastify.post("/connect-mp", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const profile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, decoded.id)).get();
    if (!profile) return reply.status(403).send({ error: "No autorizado" });

    const { code, mockToken } = request.body as any;

    const tokenToSave = mockToken || code || `APP_USR_MOCK_${crypto.randomUUID()}`;
    const encryptedAccess = MercadoPagoService.encryptToken(tokenToSave);
    const encryptedRefresh = MercadoPagoService.encryptToken("MOCK_REFRESH_TOKEN");

    const existing = db
      .select()
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.artistId, profile.id), eq(paymentAccounts.provider, "MERCADOPAGO")))
      .get();

    const now = new Date().toISOString();

    if (existing) {
      db.update(paymentAccounts)
        .set({
          accessTokenEnc: encryptedAccess,
          refreshTokenEnc: encryptedRefresh,
          isActive: true
        })
        .where(eq(paymentAccounts.id, existing.id))
        .run();
    } else {
      db.insert(paymentAccounts)
        .values({
          id: crypto.randomUUID(),
          artistId: profile.id,
          provider: "MERCADOPAGO",
          providerUserId: `SELLER_${profile.id.substring(0, 8)}`,
          accessTokenEnc: encryptedAccess,
          refreshTokenEnc: encryptedRefresh,
          createdAt: now
        })
        .run();
    }

    return { ok: true, message: "Cuenta de Mercado Pago vinculada exitosamente" };
  });

  // GET /api/payments/status — Estado de vinculación de pagos del artista
  fastify.get("/status", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const profile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, decoded.id)).get();
    if (!profile) return reply.status(403).send({ error: "No autorizado" });

    const mpAccount = db
      .select()
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.artistId, profile.id), eq(paymentAccounts.provider, "MERCADOPAGO")))
      .get();

    return {
      mercadopago: {
        connected: !!mpAccount && mpAccount.isActive,
        providerUserId: mpAccount?.providerUserId || null
      }
    };
  });
}

