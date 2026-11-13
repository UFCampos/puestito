import { and, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "../db/index.js";
import { commissionOrders, orderMilestonePayments, paymentAccounts } from "../db/schema.js";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { decryptSecret, encryptSecret } from "./crypto.service.js";
import { MercadoPagoService, type MpPayment } from "./mercadopago.service.js";
import { notifyDiscord } from "./notification.service.js";
import { getOpenDispute, openDisputeTx, resolveOpenDisputeTx } from "./dispute.service.js";
import {
  TERMINAL_STATUSES,
  addSystemMessage,
  cancelOrderTx,
  daysMs,
  notifyOrder,
  pendingPayment,
  transition,
  type Order,
  type OrderStatus
} from "./order.service.js";

export type MilestonePayment = typeof orderMilestonePayments.$inferSelect;

const money = (n: number) => `$${n.toLocaleString("es-AR")} ARS`;

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

/** ¿El artista puede cobrar? En modo simulado siempre; en vivo necesita Mercado Pago vinculado. */
export async function artistCanCharge(artistId: string): Promise<boolean> {
  if (config.PAYMENTS_MODE !== "live") return true;
  const [account] = await db
    .select({ id: paymentAccounts.id })
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.artistId, artistId),
        eq(paymentAccounts.provider, "MERCADOPAGO"),
        eq(paymentAccounts.isActive, true)
      )
    )
    .limit(1);
  return Boolean(account);
}

// ─────────────────────────────────────────────────────────────
// Procesamiento de pagos (webhook / retorno / simulador)
// ─────────────────────────────────────────────────────────────
type NextStep = { to: OrderStatus; message: string };

const NEXT_AFTER_PAYMENT: Record<string, NextStep> = {
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

function nextAfterPayment(order: Order): NextStep | undefined {
  if (order.paymentPlanSnapshot === "MILESTONES") {
    const index = order.status === "MILESTONE_WAITING_PAYMENT" ? order.currentMilestone : 0;
    const title = order.milestonesSnapshot[index]?.title ?? "";
    const base = `Etapa ${index + 1} de ${order.milestonesSnapshot.length} ("${title}") paga: el artista ya puede empezarla.`;
    if (order.status === "ACCEPTED_WAITING_DEPOSIT" || order.status === "MILESTONE_WAITING_PAYMENT") {
      return { to: "MILESTONE_IN_PROGRESS", message: base };
    }
    if (order.status === "EXPIRED") {
      return { to: "MILESTONE_IN_PROGRESS", message: `${base} (El pago llegó después del vencimiento y el pedido se reactivó.)` };
    }
    return undefined;
  }
  // Una solicitud que venció sin respuesta del artista no se reactiva con un pago
  if (order.status === "EXPIRED" && !order.acceptedAt) return undefined;
  return NEXT_AFTER_PAYMENT[order.status];
}

/** Cambios extra del pedido al acreditarse un pago: cierre, etapa en curso y plazo de entrega */
function paymentTransitionExtras(order: Order, next: NextStep): Partial<typeof commissionOrders.$inferInsert> {
  const extra: Partial<typeof commissionOrders.$inferInsert> = {};
  if (next.to === "COMPLETED_HD_UNLOCKED") extra.completedAt = new Date();
  if (order.paymentPlanSnapshot === "MILESTONES") {
    // Un pedido por etapas reactivado tras vencer vuelve a la primera etapa
    const index = order.status === "MILESTONE_WAITING_PAYMENT" ? order.currentMilestone : 0;
    if (order.status !== "MILESTONE_WAITING_PAYMENT") extra.currentMilestone = 0;
    // Cada etapa tiene su propio plazo, que empieza cuando se paga
    extra.workDueAt = new Date(Date.now() + daysMs(order.milestonesSnapshot[index]?.days ?? order.serviceSnapshot.turnaroundDays));
  } else if (next.to === "IN_PROGRESS_SKETCH") {
    // El plazo estimado del servicio empieza con el primer pago
    extra.workDueAt = new Date(Date.now() + daysMs(order.serviceSnapshot.turnaroundDays));
  }
  return extra;
}

/**
 * Si el pago que el pedido está esperando ya figura acreditado (p. ej. se pagó mientras había un
 * reclamo abierto), avanza el pedido como si el pago acabara de entrar.
 */
export async function advanceIfAlreadyPaidTx(tx: DbOrTx, order: Order): Promise<Order> {
  const expected = pendingPayment(order);
  if (!expected) return order;
  const [paid] = await tx
    .select()
    .from(orderMilestonePayments)
    .where(
      and(
        eq(orderMilestonePayments.orderId, order.id),
        eq(orderMilestonePayments.stage, expected.stage),
        eq(orderMilestonePayments.milestoneIndex, expected.milestoneIndex),
        eq(orderMilestonePayments.status, "APPROVED")
      )
    )
    .limit(1);
  const next = nextAfterPayment(order);
  if (!paid || !next) return order;
  const updated = await transition(tx, order.id, order.status, next.to, paymentTransitionExtras(order, next));
  await addSystemMessage(tx, order.id, `💳 El pago #${paid.mpPaymentId ?? "—"} ya estaba acreditado. ${next.message}`);
  return updated;
}

export type PaymentOutcome = "applied" | "already_processed" | "ignored";

type Applied = {
  outcome: PaymentOutcome;
  order?: Order;
  notify?: { to: "buyer" | "artist" | "both"; subject: string; message: string } | null;
  discord?: string | null;
};

/**
 * Aplica el resultado de un pago de Mercado Pago a su hito y al pedido.
 * Idempotente: se puede llamar varias veces con el mismo pago.
 *
 * Además de las acreditaciones cubre lo que pasa después: reembolsos, contracargos y reclamos
 * abiertos en Mercado Pago dejan de ser solo un registro y mueven el pedido.
 */
export async function applyMpPayment(
  payment: Pick<MpPayment, "id" | "status" | "external_reference" | "transaction_amount" | "currency_id" | "transaction_amount_refunded">
): Promise<PaymentOutcome> {
  const milestoneId = payment.external_reference;
  if (!milestoneId || !/^[0-9a-f-]{36}$/i.test(milestoneId)) return "ignored";

  const result = await db.transaction(async (tx): Promise<Applied> => {
    const [milestone] = await tx
      .select()
      .from(orderMilestonePayments)
      .where(eq(orderMilestonePayments.id, milestoneId))
      .for("update");
    if (!milestone) return { outcome: "ignored" };

    const [order] = await tx.select().from(commissionOrders).where(eq(commissionOrders.id, milestone.orderId)).for("update");
    if (!order) return { outcome: "ignored" };

    const mpPaymentId = String(payment.id);
    const isTerminal = TERMINAL_STATUSES.includes(order.status);

    // ── Reembolso total (lo emitió el artista o lo resolvió Mercado Pago) ──
    if (payment.status === "refunded") {
      if (milestone.status === "REFUNDED") return { outcome: "already_processed" };
      await tx
        .update(orderMilestonePayments)
        .set({ status: "REFUNDED", mpPaymentId })
        .where(eq(orderMilestonePayments.id, milestone.id));
      const base = `↩️ El pago #${mpPaymentId} (${money(milestone.grossAmount)}) fue reembolsado al comprador en Mercado Pago.`;
      if (isTerminal) {
        await addSystemMessage(
          tx,
          order.id,
          order.status === "COMPLETED_HD_UNLOCKED" ? `${base} La descarga del original queda bloqueada.` : base
        );
        return {
          outcome: "applied",
          order,
          notify: { to: "both", subject: "Pago reembolsado", message: `Se reembolsó el pago #${mpPaymentId} de ${money(milestone.grossAmount)}.` },
          discord: `↩️ Reembolso en #${order.orderNumber} (pedido ${order.status}), pago MP ${mpPaymentId}`
        };
      }
      const cancelled = await cancelOrderTx(tx, order.id, order.status, `${base} El pedido quedó cancelado.`);
      await resolveOpenDisputeTx(tx, order.id, "REFUNDED", { note: "Reembolso registrado en Mercado Pago" });
      return {
        outcome: "applied",
        order: cancelled,
        notify: {
          to: "both",
          subject: "Pedido cancelado con reembolso",
          message: `Se reembolsó el pago #${mpPaymentId} de ${money(milestone.grossAmount)} y el pedido quedó cancelado.`
        },
        discord: `↩️ Reembolso en #${order.orderNumber}: pedido cancelado (pago MP ${mpPaymentId})`
      };
    }

    // ── Contracargo: el banco del comprador revirtió el cobro ──
    if (payment.status === "charged_back") {
      if (milestone.status === "CHARGED_BACK") return { outcome: "already_processed" };
      await tx
        .update(orderMilestonePayments)
        .set({ status: "CHARGED_BACK", mpPaymentId })
        .where(eq(orderMilestonePayments.id, milestone.id));
      const description = `Mercado Pago informó un contracargo sobre el pago #${mpPaymentId} (${money(milestone.grossAmount)}).`;
      let current = order;
      if (!isTerminal && order.status !== "DISPUTED") {
        current = (await openDisputeTx(tx, order, { openedById: null, openerRole: "SYSTEM", reason: "PROVIDER_CLAIM", description })).order;
      } else {
        await addSystemMessage(
          tx,
          order.id,
          `⚠️ ${description}${order.status === "COMPLETED_HD_UNLOCKED" ? " La descarga del original queda bloqueada." : ""}`
        );
      }
      return {
        outcome: "applied",
        order: current,
        notify: {
          to: "both",
          subject: "Contracargo informado por Mercado Pago",
          message: `${description} El equipo de TuPuestito va a revisar el pedido.`
        },
        discord: `🚨 CONTRACARGO en #${order.orderNumber} (pago MP ${mpPaymentId}, ${money(milestone.grossAmount)})`
      };
    }

    // ── Reclamo abierto por el comprador dentro de Mercado Pago ──
    if (payment.status === "in_mediation") {
      if (milestone.status !== "APPROVED" || order.status === "DISPUTED") return { outcome: "already_processed" };
      const description = `El comprador inició un reclamo en Mercado Pago por el pago #${mpPaymentId} (${money(milestone.grossAmount)}). Mercado Pago retiene ese dinero hasta resolverlo.`;
      if (isTerminal) {
        return { outcome: "applied", order, notify: null, discord: `⚠️ Reclamo en Mercado Pago sobre #${order.orderNumber} (${order.status}), pago ${mpPaymentId}` };
      }
      const opened = await openDisputeTx(tx, order, { openedById: null, openerRole: "SYSTEM", reason: "PROVIDER_CLAIM", description });
      return {
        outcome: "applied",
        order: opened.order,
        notify: { to: "both", subject: "Reclamo abierto en Mercado Pago", message: `${description} El pedido queda en pausa.` },
        discord: `⚠️ Reclamo en Mercado Pago sobre #${order.orderNumber}: pedido en pausa (pago ${mpPaymentId})`
      };
    }

    if (payment.status !== "approved") {
      if (payment.status === "rejected" || payment.status === "cancelled") {
        await tx
          .update(orderMilestonePayments)
          .set({ status: "REJECTED", mpPaymentId })
          .where(and(eq(orderMilestonePayments.id, milestone.id), eq(orderMilestonePayments.status, "PENDING")));
      }
      return { outcome: "ignored" };
    }

    if (milestone.status === "APPROVED") {
      // Un reembolso parcial deja el pago "approved": lo hace el artista por fuera y lo revisa una persona
      if ((payment.transaction_amount_refunded ?? 0) > 0) {
        return {
          outcome: "already_processed",
          discord: `⚠️ Reembolso parcial de ${money(Math.round(payment.transaction_amount_refunded!))} en #${order.orderNumber} (pago MP ${mpPaymentId}). Revisar a mano.`
        };
      }
      return { outcome: "already_processed" };
    }
    // Un pago ya reembolsado o con contracargo no vuelve a acreditarse solo
    if (milestone.status === "REFUNDED" || milestone.status === "CHARGED_BACK") return { outcome: "already_processed" };

    if (payment.currency_id !== "ARS" || Math.round(payment.transaction_amount) !== milestone.grossAmount) {
      console.error("[mp] Monto/moneda no coinciden", { milestoneId, payment });
      await addSystemMessage(tx, order.id, `⚠️ Se recibió el pago #${mpPaymentId} pero el monto no coincide con el pactado. Soporte lo revisará.`);
      return { outcome: "ignored", discord: `⚠️ Pago con monto inválido en #${order.orderNumber} (MP ${mpPaymentId})` };
    }

    await tx
      .update(orderMilestonePayments)
      .set({ status: "APPROVED", mpPaymentId, paidAt: new Date() })
      .where(eq(orderMilestonePayments.id, milestone.id));

    const expected = pendingPayment({
      ...order,
      status: order.status === "EXPIRED" && order.acceptedAt ? "ACCEPTED_WAITING_DEPOSIT" : order.status
    });
    const stageMatches = expected?.stage === milestone.stage && expected.milestoneIndex === milestone.milestoneIndex;
    const next = nextAfterPayment(order);
    if (!stageMatches || !next) {
      await addSystemMessage(
        tx,
        order.id,
        `💳 Pago #${mpPaymentId} acreditado (${money(milestone.grossAmount)}), pero el pedido está ${order.status === "DISPUTED" ? "en reclamo" : "cerrado o en otra etapa"}. El equipo de TuPuestito lo va a revisar.`
      );
      return {
        outcome: "applied",
        order,
        notify: null,
        discord: `⚠️ Pago acreditado fuera de flujo en #${order.orderNumber}: estado ${order.status}, hito ${milestone.stage}`
      };
    }

    const updated = await transition(tx, order.id, order.status, next.to, paymentTransitionExtras(order, next));
    await addSystemMessage(tx, order.id, `💳 Pago #${mpPaymentId} APROBADO (${money(milestone.grossAmount)}). ${next.message}`);
    return {
      outcome: "applied",
      order: updated,
      notify: { to: "both", subject: "Pago acreditado", message: next.message },
      discord: `💳 Pago aprobado en #${updated.orderNumber} → ${updated.status}`
    };
  });

  if (result.order && result.notify) void notifyOrder(result.order, result.notify.to, result.notify.subject, result.notify.message);
  if (result.discord) void notifyDiscord(result.discord);
  return result.outcome;
}

// ─────────────────────────────────────────────────────────────
// Reembolsos emitidos desde la plataforma (siempre con el consentimiento del artista)
// ─────────────────────────────────────────────────────────────
export async function approvedPayments(tx: DbOrTx, orderId: string): Promise<MilestonePayment[]> {
  return tx
    .select()
    .from(orderMilestonePayments)
    .where(and(eq(orderMilestonePayments.orderId, orderId), eq(orderMilestonePayments.status, "APPROVED")));
}

/**
 * Reembolsa en Mercado Pago los pagos indicados usando la cuenta del artista.
 * Va de a uno y deja registrado cada reembolso apenas se confirma, así un reintento retoma
 * donde quedó sin devolver nada dos veces.
 */
export async function refundPayments(order: Order, paymentIds: string[]): Promise<{ refunded: MilestonePayment[]; failed: MilestonePayment[] }> {
  if (paymentIds.length === 0) return { refunded: [], failed: [] };
  const rows = await db
    .select()
    .from(orderMilestonePayments)
    .where(and(eq(orderMilestonePayments.orderId, order.id), inArray(orderMilestonePayments.id, paymentIds)));
  const pending = rows.filter((r) => r.status === "APPROVED");
  const refunded = rows.filter((r) => r.status === "REFUNDED");
  const failed: MilestonePayment[] = [];
  if (pending.length === 0) return { refunded, failed };

  const live = config.PAYMENTS_MODE === "live";
  const mp = live ? await getArtistMpToken(order.artistId) : null;
  if (live && !mp) {
    throw new HttpError(409, "Para emitir el reembolso necesitás tener Mercado Pago vinculado. Reconectalo desde tu panel.");
  }

  for (const row of pending) {
    try {
      if (live) {
        if (!row.mpPaymentId) throw new Error("El pago no tiene identificador de Mercado Pago");
        await MercadoPagoService.refundPayment(row.mpPaymentId, mp!.token, `tp-refund-${row.id}`);
      }
      await db.update(orderMilestonePayments).set({ status: "REFUNDED" }).where(eq(orderMilestonePayments.id, row.id));
      refunded.push({ ...row, status: "REFUNDED" });
    } catch (err) {
      console.error("[mp] Falló el reembolso", { order: order.orderNumber, payment: row.id, err });
      failed.push(row);
    }
  }
  return { refunded, failed };
}

/** Reclamo abierto del pedido, para las rutas que necesitan leerlo fuera de una transacción */
export const openDisputeOf = (orderId: string) => getOpenDispute(db, orderId);
