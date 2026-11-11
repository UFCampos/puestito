import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../db/index.js";
import {
  artistProfiles,
  commissionOrders,
  orderMessages,
  orderMilestonePayments,
  paymentAccounts,
  users
} from "../db/schema.js";
import { config } from "../config.js";
import { decryptSecret, encryptSecret } from "./crypto.service.js";
import { MercadoPagoService, type MpPayment } from "./mercadopago.service.js";
import { notifyDiscord, sendEmail, html } from "./notification.service.js";
import { HttpError } from "../lib/http.js";

export type Order = typeof commissionOrders.$inferSelect;
export type OrderStatus = Order["status"];
export type PaymentPlan = Order["paymentPlanSnapshot"];
export type MilestoneStage = (typeof orderMilestonePayments.$inferSelect)["stage"];

export const PLAN_LABEL: Record<PaymentPlan, string> = {
  FULL_100: "100% al inicio",
  SPLIT_ON_SKETCH: "50% de seña al aceptar el pedido y 50% al aprobar el boceto",
  SPLIT_ON_FINAL_PREVIEW: "50% de seña al aceptar el pedido y 50% al aprobar la vista previa final con marca de agua"
};

/** Estados en los que el pedido ya no admite acciones */
export const TERMINAL_STATUSES: OrderStatus[] = ["REJECTED", "EXPIRED", "CANCELLED", "COMPLETED_HD_UNLOCKED"];
/** Estados que ocupan un cupo (max_slots) del servicio */
export const SLOT_STATUSES: OrderStatus[] = [
  "ACCEPTED_WAITING_DEPOSIT",
  "IN_PROGRESS_SKETCH",
  "SKETCH_REVIEW",
  "WAITING_PAYMENT_AFTER_SKETCH",
  "WORKING_FINAL",
  "FINAL_PREVIEW_REVIEW",
  "WAITING_PAYMENT_BEFORE_HD"
];

/** Cálculo de montos y fee (Plan Sprint 5: marketplace_fee 5%) */
export function computeAmounts(plan: PaymentPlan, totalAmount: number) {
  const platformFeeAmount = Math.round(totalAmount * config.PLATFORM_FEE_RATE);
  if (plan === "FULL_100") {
    return { platformFeeAmount, depositAmount: totalAmount, finalAmount: 0 };
  }
  const depositAmount = Math.round(totalAmount / 2);
  return { platformFeeAmount, depositAmount, finalAmount: totalAmount - depositAmount };
}

/** Fee de cada hito: el del segundo pago completa el total exacto pactado */
export function milestoneFee(order: Order, stage: MilestoneStage): number {
  if (stage === "FULL_100") return order.platformFeeAmount;
  const depositFee = Math.round(order.depositAmount * config.PLATFORM_FEE_RATE);
  return stage === "DEPOSIT_50" ? depositFee : order.platformFeeAmount - depositFee;
}

/** Qué hito de pago corresponde al estado actual (o null si no hay pago pendiente) */
export function expectedStage(order: Pick<Order, "status" | "paymentPlanSnapshot">): MilestoneStage | null {
  switch (order.status) {
    case "ACCEPTED_WAITING_DEPOSIT":
      return order.paymentPlanSnapshot === "FULL_100" ? "FULL_100" : "DEPOSIT_50";
    case "WAITING_PAYMENT_AFTER_SKETCH":
    case "WAITING_PAYMENT_BEFORE_HD":
      return "FINAL_50";
    default:
      return null;
  }
}

/** Concepto neutro para Mercado Pago (Plan §2) */
export function neutralTitle(orderNumber: string, artistUsername: string, stage: MilestoneStage) {
  const part = stage === "FULL_100" ? "pago total" : stage === "DEPOSIT_50" ? "seña 50%" : "saldo 50%";
  return `Encargo de ilustración digital #${orderNumber} — @${artistUsername} (${part})`;
}

export async function addSystemMessage(tx: DbOrTx, orderId: string, content: string) {
  await tx.insert(orderMessages).values({ orderId, senderId: null, type: "SYSTEM_EVENT", content });
}

/**
 * Transición atómica: solo cambia si el estado actual sigue siendo `from`.
 * Evita carreras (doble clic, webhook duplicado, etc.).
 */
export async function transition(
  tx: DbOrTx,
  orderId: string,
  from: OrderStatus | OrderStatus[],
  to: OrderStatus,
  extra: Partial<typeof commissionOrders.$inferInsert> = {}
): Promise<Order> {
  const fromList = Array.isArray(from) ? from : [from];
  const [updated] = await tx
    .update(commissionOrders)
    .set({ ...extra, status: to })
    .where(and(eq(commissionOrders.id, orderId), inArray(commissionOrders.status, fromList)))
    .returning();
  if (!updated) {
    throw new HttpError(409, "El pedido cambió de estado. Recargá la página e intentá de nuevo.");
  }
  return updated;
}

/** Participantes del pedido con email, para notificaciones */
export async function orderParties(order: Pick<Order, "buyerId" | "artistId">) {
  const [buyer] = await db
    .select({ id: users.id, email: users.email, name: users.name, username: users.username })
    .from(users)
    .where(eq(users.id, order.buyerId));
  const [artist] = await db
    .select({ id: users.id, email: users.email, name: users.name, username: users.username, profileId: artistProfiles.id })
    .from(artistProfiles)
    .innerJoin(users, eq(artistProfiles.userId, users.id))
    .where(eq(artistProfiles.id, order.artistId));
  return { buyer: buyer!, artist: artist! };
}

export async function notifyOrder(
  order: Pick<Order, "id" | "orderNumber" | "buyerId" | "artistId">,
  to: "buyer" | "artist" | "both",
  subject: string,
  message: string
) {
  const parties = await orderParties(order);
  const url = `${config.WEB_URL}/orders/${order.id}`;
  const recipients = to === "both" ? [parties.buyer, parties.artist] : [parties[to]];
  await Promise.all(
    recipients.map((r) =>
      sendEmail({
        to: r.email,
        subject: `${subject} · #${order.orderNumber}`,
        title: subject,
        html: `<p>Hola ${html.escape(r.name)},</p><p>${html.escape(message)}</p>`,
        cta: { label: "Abrir sala del pedido", url }
      })
    )
  );
}

// ─────────────────────────────────────────────────────────────
// Cuenta de Mercado Pago del artista (con refresco de token)
// ─────────────────────────────────────────────────────────────
export async function getArtistMpToken(artistId: string): Promise<{ token: string; liveMode: boolean; accountId: string } | null> {
  const [account] = await db
    .select()
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.artistId, artistId),
        eq(paymentAccounts.provider, "MERCADOPAGO"),
        eq(paymentAccounts.isActive, true)
      )
    )
    .limit(1);
  if (!account) return null;

  let token = decryptSecret(account.accessTokenEnc);
  const expiresSoon = account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + 7 * 86400_000;
  if (expiresSoon && account.refreshTokenEnc && config.PAYMENTS_MODE === "live") {
    try {
      const refreshed = await MercadoPagoService.refreshToken(decryptSecret(account.refreshTokenEnc));
      token = refreshed.access_token;
      await db
        .update(paymentAccounts)
        .set({
          accessTokenEnc: encryptSecret(refreshed.access_token),
          refreshTokenEnc: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : account.refreshTokenEnc,
          tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null
        })
        .where(eq(paymentAccounts.id, account.id));
    } catch (err) {
      console.error("[mp] No se pudo refrescar el token del artista", artistId, err);
      if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now()) {
        await db.update(paymentAccounts).set({ isActive: false }).where(eq(paymentAccounts.id, account.id));
        return null;
      }
    }
  }
  return { token, liveMode: account.liveMode, accountId: account.id };
}

// ─────────────────────────────────────────────────────────────
// Procesamiento de pagos (webhook / retorno / simulador)
// ─────────────────────────────────────────────────────────────
const NEXT_AFTER_PAYMENT: Record<string, { to: OrderStatus; message: string }> = {
  ACCEPTED_WAITING_DEPOSIT: {
    to: "IN_PROGRESS_SKETCH",
    message: "Pago inicial acreditado directamente en la cuenta del artista. ¡El artista comenzó el boceto!"
  },
  EXPIRED: {
    to: "IN_PROGRESS_SKETCH",
    message: "Pago inicial acreditado (llegó después del vencimiento, el pedido se reactivó). ¡El artista comenzó el boceto!"
  },
  WAITING_PAYMENT_AFTER_SKETCH: {
    to: "WORKING_FINAL",
    message: "Segundo pago (50%) acreditado al artista. El artista sigue con la obra final."
  },
  WAITING_PAYMENT_BEFORE_HD: {
    to: "COMPLETED_HD_UNLOCKED",
    message: "Pago final (50%) acreditado. ¡Se desbloqueó la descarga del archivo original HD sin marca de agua!"
  }
};

export type PaymentOutcome = "applied" | "already_processed" | "ignored";

/**
 * Aplica el resultado de un pago de Mercado Pago a su hito y al pedido.
 * Idempotente: se puede llamar varias veces con el mismo pago.
 */
export async function applyMpPayment(payment: Pick<MpPayment, "id" | "status" | "external_reference" | "transaction_amount" | "currency_id">): Promise<PaymentOutcome> {
  const milestoneId = payment.external_reference;
  if (!milestoneId || !/^[0-9a-f-]{36}$/i.test(milestoneId)) return "ignored";

  const result = await db.transaction(async (tx) => {
    const [milestone] = await tx
      .select()
      .from(orderMilestonePayments)
      .where(eq(orderMilestonePayments.id, milestoneId))
      .for("update");
    if (!milestone) return { outcome: "ignored" as const };

    const [order] = await tx.select().from(commissionOrders).where(eq(commissionOrders.id, milestone.orderId)).for("update");
    if (!order) return { outcome: "ignored" as const };

    const mpPaymentId = String(payment.id);

    if (payment.status === "refunded" || payment.status === "charged_back") {
      await tx
        .update(orderMilestonePayments)
        .set({ status: payment.status === "refunded" ? "REFUNDED" : "CHARGED_BACK", mpPaymentId })
        .where(eq(orderMilestonePayments.id, milestone.id));
      await addSystemMessage(tx, order.id, `⚠️ El pago #${mpPaymentId} figura como ${payment.status === "refunded" ? "reembolsado" : "contracargo"} en Mercado Pago.`);
      return { outcome: "applied" as const, order, notify: null };
    }

    if (payment.status !== "approved") {
      if (payment.status === "rejected" || payment.status === "cancelled") {
        await tx
          .update(orderMilestonePayments)
          .set({ status: "REJECTED", mpPaymentId })
          .where(and(eq(orderMilestonePayments.id, milestone.id), eq(orderMilestonePayments.status, "PENDING")));
      }
      return { outcome: "ignored" as const };
    }

    if (milestone.status === "APPROVED") return { outcome: "already_processed" as const };

    if (payment.currency_id !== "ARS" || Math.round(payment.transaction_amount) !== milestone.grossAmount) {
      console.error("[mp] Monto/moneda no coinciden", { milestoneId, payment });
      await addSystemMessage(tx, order.id, `⚠️ Se recibió el pago #${mpPaymentId} pero el monto no coincide con el pactado. Soporte lo revisará.`);
      await notifyDiscord(`⚠️ Pago con monto inválido en #${order.orderNumber} (MP ${mpPaymentId})`);
      return { outcome: "ignored" as const };
    }

    await tx
      .update(orderMilestonePayments)
      .set({ status: "APPROVED", mpPaymentId, paidAt: new Date() })
      .where(eq(orderMilestonePayments.id, milestone.id));

    const stageMatches = expectedStage({ ...order, status: order.status === "EXPIRED" ? "ACCEPTED_WAITING_DEPOSIT" : order.status }) === milestone.stage;
    const next = NEXT_AFTER_PAYMENT[order.status];
    if (!stageMatches || !next) {
      await addSystemMessage(tx, order.id, `💳 Pago #${mpPaymentId} acreditado, pero el pedido está en estado ${order.status}. Soporte lo revisará.`);
      await notifyDiscord(`⚠️ Pago acreditado fuera de flujo en #${order.orderNumber}: estado ${order.status}, hito ${milestone.stage}`);
      return { outcome: "applied" as const, order, notify: null };
    }

    const updated = await transition(tx, order.id, order.status, next.to, next.to === "COMPLETED_HD_UNLOCKED" ? { completedAt: new Date() } : {});
    await addSystemMessage(tx, order.id, `💳 Pago #${mpPaymentId} APROBADO ($${milestone.grossAmount.toLocaleString("es-AR")} ARS). ${next.message}`);
    return { outcome: "applied" as const, order: updated, notify: next.message };
  });

  if (result.outcome === "applied" && result.order && result.notify) {
    void notifyOrder(result.order, "both", "Pago acreditado", result.notify);
    void notifyDiscord(`💳 Pago aprobado en #${result.order.orderNumber} → ${result.order.status}`);
  }
  return result.outcome;
}

// ─────────────────────────────────────────────────────────────
// Vencimiento: ACCEPTED_WAITING_DEPOSIT → EXPIRED a las 72 hs (Plan §4)
// ─────────────────────────────────────────────────────────────
export async function expireUnpaidOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - config.DEPOSIT_EXPIRATION_HOURS * 3600_000);
  const expired = await db
    .update(commissionOrders)
    .set({ status: "EXPIRED" })
    .where(and(eq(commissionOrders.status, "ACCEPTED_WAITING_DEPOSIT"), lt(commissionOrders.acceptedAt, cutoff)))
    .returning();

  for (const order of expired) {
    await addSystemMessage(db, order.id, `⌛ El pedido venció: no se registró el pago inicial dentro de las ${config.DEPOSIT_EXPIRATION_HOURS} hs.`);
    void notifyOrder(order, "both", "Pedido vencido", "No se registró el pago inicial a tiempo y el pedido venció. El cupo quedó liberado.");
  }
  return expired.length;
}

export async function nextOrderNumber(tx: DbOrTx): Promise<string> {
  const res = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq')::text as n`);
  return `PST-${res.rows[0]!.n}`;
}
