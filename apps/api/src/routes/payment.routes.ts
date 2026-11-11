import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import crypto from "node:crypto";
import {
  commissionOrders,
  orderMilestonePayments,
  paymentAccounts,
  webhookEvents
} from "../db/schema.js";
import { config, isProd } from "../config.js";
import { HttpError, parseBody, requireArtist, requireUser } from "../lib/http.js";
import { encryptSecret, hmac, safeEqual } from "../services/crypto.service.js";
import { MercadoPagoService, pkcePair } from "../services/mercadopago.service.js";
import { applyMpPayment, getArtistMpToken } from "../services/order.service.js";
import { notifyDiscord, html } from "../services/notification.service.js";

const OAUTH_COOKIE = "tp_mp_oauth";

export async function paymentRoutes(fastify: FastifyInstance) {
  // ───────────────────────────────────────────────────────────
  // GET /api/payments/status — estado de vinculación del artista
  // ───────────────────────────────────────────────────────────
  fastify.get("/status", async (request) => {
    const { profile } = await requireArtist(request);
    const accounts = await db
      .select({
        provider: paymentAccounts.provider,
        providerUserId: paymentAccounts.providerUserId,
        isActive: paymentAccounts.isActive,
        liveMode: paymentAccounts.liveMode,
        tokenExpiresAt: paymentAccounts.tokenExpiresAt
      })
      .from(paymentAccounts)
      .where(eq(paymentAccounts.artistId, profile.id));
    const mp = accounts.find((a) => a.provider === "MERCADOPAGO" && a.isActive);
    return {
      paymentsMode: config.PAYMENTS_MODE,
      mercadopago: { connected: Boolean(mp), providerUserId: mp?.providerUserId ?? null, liveMode: mp?.liveMode ?? false },
      // Plan §1: AstroPay queda en sandbox / futuro (cobros en USD)
      astropay: { connected: false, available: false }
    };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/payments/mp/connect — inicia OAuth de Mercado Pago (PKCE + state firmado)
  // ───────────────────────────────────────────────────────────
  fastify.post("/mp/connect", async (request, reply) => {
    const { profile } = await requireArtist(request);

    if (config.PAYMENTS_MODE === "mock") {
      // Desarrollo sin credenciales: vincula una cuenta simulada
      await db
        .insert(paymentAccounts)
        .values({
          artistId: profile.id,
          provider: "MERCADOPAGO",
          providerUserId: `MOCK-${profile.id.slice(0, 8)}`,
          accessTokenEnc: encryptSecret("MOCK_ACCESS_TOKEN"),
          liveMode: false
        })
        .onConflictDoUpdate({
          target: [paymentAccounts.artistId, paymentAccounts.provider],
          set: { isActive: true, accessTokenEnc: encryptSecret("MOCK_ACCESS_TOKEN") }
        });
      return { url: `${config.WEB_URL}/dashboard?mp=connected` };
    }

    if (!config.MP_CLIENT_ID || !config.MP_CLIENT_SECRET) throw new HttpError(503, "Mercado Pago no está configurado");
    const { verifier, challenge } = pkcePair();
    const nonce = crypto.randomUUID();
    const exp = Math.floor(Date.now() / 1000) + 600;
    const statePayload = `${profile.id}.${nonce}.${exp}`;
    const state = `${statePayload}.${hmac(`mp-state:${statePayload}`)}`;

    reply.setCookie(OAUTH_COOKIE, `${nonce}.${verifier}`, {
      path: "/api/payments/mp",
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 600,
      signed: true
    });
    return { url: MercadoPagoService.authorizationUrl(state, challenge) };
  });

  // GET /api/payments/mp/callback — Mercado Pago redirige acá con ?code&state
  fastify.get("/mp/callback", async (request, reply) => {
    const back = (result: string) => reply.redirect(`${config.WEB_URL}/dashboard?mp=${result}`);
    const q = request.query as { code?: string; state?: string; error?: string };
    if (q.error || !q.code || !q.state) return back("cancelled");

    const [artistId, nonce, expStr, sig] = q.state.split(".");
    const statePayload = `${artistId}.${nonce}.${expStr}`;
    if (!artistId || !nonce || !sig || !safeEqual(hmac(`mp-state:${statePayload}`), sig) || Number(expStr) < Date.now() / 1000) {
      return back("invalid_state");
    }
    const cookie = request.unsignCookie(request.cookies[OAUTH_COOKIE] ?? "");
    const [cookieNonce, verifier] = cookie.valid && cookie.value ? cookie.value.split(".") : [];
    reply.clearCookie(OAUTH_COOKIE, { path: "/api/payments/mp" });
    if (!verifier || cookieNonce !== nonce) return back("invalid_state");

    // La sesión debe ser del mismo artista que inició el flujo
    const { profile } = await requireArtist(request).catch(() => ({ profile: null }));
    if (!profile || profile.id !== artistId) return back("session_mismatch");

    try {
      const token = await MercadoPagoService.exchangeCode(q.code, verifier);
      const values = {
        providerUserId: String(token.user_id),
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        publicKey: token.public_key ?? null,
        liveMode: Boolean(token.live_mode),
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        isActive: true
      };
      await db
        .insert(paymentAccounts)
        .values({ artistId: profile.id, provider: "MERCADOPAGO", ...values })
        .onConflictDoUpdate({ target: [paymentAccounts.artistId, paymentAccounts.provider], set: values });
      void notifyDiscord(`💳 Artista ${profile.id} vinculó Mercado Pago (user ${token.user_id}, live=${token.live_mode})`);
      return back("connected");
    } catch (err) {
      request.log.error({ err }, "Error en OAuth de Mercado Pago");
      return back("error");
    }
  });

  // DELETE /api/payments/mp — desvincular
  fastify.delete("/mp", async (request) => {
    const { profile } = await requireArtist(request);
    await db
      .update(paymentAccounts)
      .set({ isActive: false })
      .where(and(eq(paymentAccounts.artistId, profile.id), eq(paymentAccounts.provider, "MERCADOPAGO")));
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/payments/webhook — Webhooks de Mercado Pago (firma x-signature)
  // ───────────────────────────────────────────────────────────
  fastify.post("/webhook", { config: { rateLimit: false } }, async (request, reply) => {
    if (config.PAYMENTS_MODE !== "live") return reply.status(200).send({ ignored: true });

    const query = request.query as Record<string, string | undefined>;
    const body = (request.body ?? {}) as { type?: string; action?: string; data?: { id?: string | number }; user_id?: string | number };
    const topic = query.type ?? query.topic ?? body.type;
    const dataId = query["data.id"] ?? query.id ?? (body.data?.id !== undefined ? String(body.data.id) : undefined);

    const valid = MercadoPagoService.verifyWebhookSignature({
      signatureHeader: request.headers["x-signature"] as string | undefined,
      requestId: request.headers["x-request-id"] as string | undefined,
      dataId
    });
    if (!valid) {
      request.log.warn({ query, topic }, "Webhook de Mercado Pago con firma inválida");
      return reply.status(401).send({ error: "invalid signature" });
    }
    if (topic !== "payment" || !dataId || body.user_id === undefined) return reply.status(200).send({ ignored: true });

    // Auditoría / deduplicación de la notificación
    const eventId = `mp:${dataId}:${request.headers["x-request-id"] ?? "noreq"}`;
    await db.insert(webhookEvents).values({ id: eventId, provider: "MERCADOPAGO", payload: { query, body } }).onConflictDoNothing();

    // El pago vive en la cuenta del artista (vendedor): usamos su token para consultarlo
    const [account] = await db
      .select({ artistId: paymentAccounts.artistId })
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.provider, "MERCADOPAGO"), eq(paymentAccounts.providerUserId, String(body.user_id))))
      .limit(1);
    if (!account) return reply.status(200).send({ ignored: true });

    const mp = await getArtistMpToken(account.artistId);
    if (!mp) return reply.status(200).send({ ignored: true });

    try {
      const payment = await MercadoPagoService.getPayment(dataId, mp.token);
      const outcome = await applyMpPayment(payment);
      return reply.status(200).send({ outcome });
    } catch (err) {
      request.log.error({ err, dataId }, "Error procesando webhook de Mercado Pago");
      // 500 → Mercado Pago reintenta la notificación
      return reply.status(500).send({ error: "processing_failed" });
    }
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/payments/verify — al volver del checkout (back_url) confirmamos el pago
  // sin esperar al webhook. Consulta a MP con el token del artista; nunca confía en la URL.
  // ───────────────────────────────────────────────────────────
  fastify.post("/verify", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const body = parseBody(z.object({ orderId: z.string().uuid(), paymentId: z.string().regex(/^\d{1,20}$/) }), request.body);
    const [order] = await db.select().from(commissionOrders).where(eq(commissionOrders.id, body.orderId)).limit(1);
    if (!order || order.buyerId !== user.id) throw new HttpError(404, "Pedido no encontrado");
    if (config.PAYMENTS_MODE !== "live") return { outcome: "ignored" };

    const mp = await getArtistMpToken(order.artistId);
    if (!mp) throw new HttpError(409, "El artista no tiene Mercado Pago vinculado");
    const payment = await MercadoPagoService.getPayment(body.paymentId, mp.token);

    const [milestone] = await db
      .select({ id: orderMilestonePayments.id })
      .from(orderMilestonePayments)
      .where(and(eq(orderMilestonePayments.id, payment.external_reference ?? "00000000-0000-0000-0000-000000000000"), eq(orderMilestonePayments.orderId, order.id)))
      .limit(1);
    if (!milestone) throw new HttpError(400, "El pago no corresponde a este pedido");
    const outcome = await applyMpPayment(payment);
    return { outcome, status: payment.status };
  });

  // ───────────────────────────────────────────────────────────
  // Simulador de checkout — SOLO desarrollo (PAYMENTS_MODE=mock, nunca en producción)
  // ───────────────────────────────────────────────────────────
  if (config.PAYMENTS_MODE === "mock" && !isProd) {
    fastify.get("/mock-checkout", async (request, reply) => {
      const user = await requireUser(request);
      const { milestone: milestoneId } = request.query as { milestone?: string };
      const [row] = await db
        .select({ m: orderMilestonePayments, o: commissionOrders })
        .from(orderMilestonePayments)
        .innerJoin(commissionOrders, eq(orderMilestonePayments.orderId, commissionOrders.id))
        .where(eq(orderMilestonePayments.id, milestoneId ?? "00000000-0000-0000-0000-000000000000"))
        .limit(1);
      if (!row || row.o.buyerId !== user.id) throw new HttpError(404, "Pago no encontrado");
      const { m, o } = row;
      const net = m.grossAmount - m.marketplaceFee;
      return reply.type("text/html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simulador de Mercado Pago · TuPuestito</title>
<style>body{font-family:system-ui,sans-serif;background:#009ee3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}
.card{background:#fff;padding:2rem;border-radius:16px;max-width:440px;width:100%}.row{display:flex;justify-content:space-between;margin:.4rem 0;font-size:.9rem}
.badge{background:#fef3c7;color:#92400e;font-weight:700;font-size:.7rem;padding:.25rem .6rem;border-radius:99px}
button{width:100%;padding:.9rem;border:0;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;margin-top:.6rem}</style></head>
<body><div class="card"><span class="badge">MODO DESARROLLO · SIN DINERO REAL</span>
<h2>Checkout simulado</h2><p style="color:#555;font-size:.9rem">${html.escape(`Encargo de ilustración digital #${o.orderNumber}`)}</p>
<div class="row"><span>Monto</span><strong>$${m.grossAmount.toLocaleString("es-AR")} ARS</strong></div>
<div class="row" style="color:#666"><span>Al artista</span><span>$${net.toLocaleString("es-AR")}</span></div>
<div class="row" style="color:#666"><span>marketplace_fee</span><span>$${m.marketplaceFee.toLocaleString("es-AR")}</span></div>
<form method="POST" action="/api/payments/mock-approve"><input type="hidden" name="milestoneId" value="${m.id}"/>
<button style="background:#009ee3;color:#fff" name="result" value="approved">Simular pago aprobado</button>
<button style="background:#f1f5f9" name="result" value="rejected">Simular pago rechazado</button></form></div></body></html>`);
    });

    fastify.post("/mock-approve", async (request, reply) => {
      const user = await requireUser(request);
      const body = (request.body ?? {}) as { milestoneId?: string; result?: string };
      const [row] = await db
        .select({ m: orderMilestonePayments, o: commissionOrders })
        .from(orderMilestonePayments)
        .innerJoin(commissionOrders, eq(orderMilestonePayments.orderId, commissionOrders.id))
        .where(eq(orderMilestonePayments.id, body.milestoneId ?? "00000000-0000-0000-0000-000000000000"))
        .limit(1);
      if (!row || row.o.buyerId !== user.id) throw new HttpError(404, "Pago no encontrado");
      const approved = body.result === "approved";
      await applyMpPayment({
        id: Math.floor(1e9 + Math.random() * 9e9),
        status: approved ? "approved" : "rejected",
        external_reference: row.m.id,
        transaction_amount: row.m.grossAmount,
        currency_id: "ARS"
      });
      return reply.redirect(`${config.WEB_URL}/orders/${row.o.id}?payment=${approved ? "success" : "failure"}`);
    });
  }

}
