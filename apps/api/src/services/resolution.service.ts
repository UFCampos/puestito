import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { artistProfiles, commissionOrders, orderDisputes } from "../db/schema.js";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { notifyDiscord } from "./notification.service.js";
import {
  DISPUTE_REASON_LABEL,
  USER_DISPUTE_REASONS,
  canOpenDispute,
  getOpenDispute,
  openDisputeTx,
  resolveOpenDisputeTx,
  type Dispute,
  type DisputeReason
} from "./dispute.service.js";
import { advanceIfAlreadyPaidTx, approvedPayments, refundPayments } from "./payments.service.js";
import {
  BUYER_PAYMENT_STATUSES,
  PAID_ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  addSystemMessage,
  cancelOrderTx,
  daysMs,
  notifyOrder,
  transition,
  type Order
} from "./order.service.js";

/**
 * Resolución de pedidos que no siguen el camino feliz: reclamos, cancelaciones después de un
 * pago, reembolsos y cierres por falta de pago.
 *
 * Principio: TuPuestito no custodia el dinero, así que nunca lo mueve sin el consentimiento del
 * titular de la cuenta. Un reembolso lo emite el artista (acá, para que quede registrado) o lo
 * decide Mercado Pago en su propio reclamo. Lo que sí hace la plataforma es pausar el pedido,
 * mediar, cancelarlo, retener o liberar la entrega y suspender cuentas.
 */

const money = (n: number) => `$${n.toLocaleString("es-AR")} ARS`;

const MP_CLAIM_HINT =
  "Si corresponde un reembolso y no lo recibís, podés iniciar un reclamo en Mercado Pago desde el detalle de cada pago (Actividad → pago → \"Necesito ayuda\").";

// ─────────────────────────────────────────────────────────────
// Reclamos abiertos por una de las partes
// ─────────────────────────────────────────────────────────────
export async function openUserDispute(
  order: Order,
  user: { id: string; username: string },
  role: "BUYER" | "ARTIST",
  reason: DisputeReason,
  description: string
): Promise<{ order: Order; dispute: Dispute }> {
  if (order.status === "DISPUTED") throw new HttpError(409, "Este pedido ya tiene un reclamo abierto");
  if (!canOpenDispute(order, role)) {
    throw new HttpError(
      409,
      order.status === "COMPLETED_HD_UNLOCKED"
        ? `El plazo de ${config.POST_DELIVERY_DISPUTE_DAYS} días para reclamar después de la entrega ya venció. Podés denunciar el pedido o escribir a soporte.`
        : "Solo se puede abrir un reclamo en pedidos en curso con al menos un pago acreditado. Antes de pagar podés cancelar sin costo."
    );
  }
  if (!USER_DISPUTE_REASONS[role].includes(reason)) throw new HttpError(400, "Motivo de reclamo inválido");

  const result = await db.transaction((tx) =>
    openDisputeTx(tx, order, { openedById: user.id, openerRole: role, reason, description })
  );
  void notifyOrder(
    result.order,
    role === "BUYER" ? "artist" : "buyer",
    "Se abrió un reclamo sobre el pedido",
    `${role === "BUYER" ? "El comprador" : "El artista"} abrió un reclamo: ${DISPUTE_REASON_LABEL[reason]}.\n"${description}"\nEl pedido queda en pausa. Entrá a la sala del pedido para responder y buscar una solución.`
  );
  void notifyDiscord(
    `⚠️ Reclamo en #${order.orderNumber} por @${user.username} (${role}): ${DISPUTE_REASON_LABEL[reason]} — ${description.slice(0, 300)}`
  );
  return result;
}

/** El pedido vuelve al estado en que estaba antes del reclamo */
export async function resumeDisputedOrder(
  order: Order,
  resolution: "WITHDRAWN" | "RESUMED_BY_ADMIN",
  opts: { message: string; note?: string | null; resolvedById?: string | null }
): Promise<Order> {
  const updated = await db.transaction(async (tx) => {
    const dispute = await getOpenDispute(tx, order.id);
    if (!dispute) throw new HttpError(409, "El pedido no tiene un reclamo abierto");
    const resumed = await transition(tx, order.id, "DISPUTED", dispute.statusBefore);
    await resolveOpenDisputeTx(tx, order.id, resolution, { note: opts.note, resolvedById: opts.resolvedById });
    await addSystemMessage(tx, order.id, opts.message);
    // Si mientras tanto entró el pago que el pedido estaba esperando, lo damos por pagado
    return advanceIfAlreadyPaidTx(tx, resumed);
  });
  void notifyOrder(updated, "both", "El reclamo se cerró y el pedido continúa", opts.message);
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Cancelación con reembolso
// ─────────────────────────────────────────────────────────────
/**
 * Reembolsa los pagos indicados y cancela el pedido.
 * Si Mercado Pago rechaza algún reembolso el pedido NO se cancela: se informa y se puede reintentar.
 */
export async function cancelWithRefund(
  order: Order,
  paymentIds: string[],
  opts: { partial: boolean; resolvedById?: string | null }
): Promise<Order> {
  const { refunded, failed } = await refundPayments(order, paymentIds);
  if (failed.length > 0) {
    await addSystemMessage(
      db,
      order.id,
      `⚠️ Mercado Pago no pudo procesar ${failed.length} de ${paymentIds.length} reembolso(s). El pedido sigue abierto; el artista puede reintentarlo.`
    );
    void notifyDiscord(`🚨 Reembolso incompleto en #${order.orderNumber}: ${refunded.length} ok, ${failed.length} con error`);
    throw new HttpError(
      502,
      `Mercado Pago no pudo procesar ${failed.length} reembolso(s). Los que sí se hicieron ya quedaron registrados; probá de nuevo en unos minutos.`
    );
  }

  const total = refunded.reduce((acc, p) => acc + p.grossAmount, 0);
  const message =
    total > 0
      ? `🚫 Pedido cancelado. El artista reembolsó ${money(total)} (${refunded.length} pago${refunded.length === 1 ? "" : "s"}) a través de Mercado Pago.${opts.partial ? " El resto corresponde al trabajo ya entregado, según lo acordado entre las partes." : ""}`
      : "🚫 Pedido cancelado de común acuerdo, sin reembolso: los pagos realizados corresponden al trabajo ya entregado.";

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(commissionOrders).where(eq(commissionOrders.id, order.id)).for("update");
    if (!current) throw new HttpError(404, "Pedido no encontrado");
    await resolveOpenDisputeTx(tx, order.id, "REFUNDED", {
      note: opts.partial ? "Reembolso parcial aceptado por el comprador" : "Reembolso total",
      resolvedById: opts.resolvedById
    });
    // El webhook del reembolso pudo haber cancelado el pedido antes que nosotros
    if (TERMINAL_STATUSES.includes(current.status)) {
      if (current.status !== "CANCELLED") await addSystemMessage(tx, order.id, message);
      return current;
    }
    return cancelOrderTx(tx, order.id, current.status, message);
  });
  void notifyOrder(
    updated,
    "both",
    "Pedido cancelado",
    total > 0
      ? `El pedido se canceló y se reembolsaron ${money(total)}. Mercado Pago puede tardar unos días en acreditarlo según el medio de pago.`
      : "El pedido se canceló de común acuerdo, sin reembolso."
  );
  void notifyDiscord(`🚫 #${order.orderNumber} cancelado con reembolso de ${money(total)}${opts.partial ? " (parcial)" : ""}`);
  return updated;
}

/**
 * El artista cancela un pedido ya pagado.
 * - Reembolsando TODO lo cobrado: es unilateral, el comprador no pierde nada.
 * - Reembolsando una parte (o nada): solo dentro de un reclamo y como propuesta que el comprador
 *   tiene que aceptar.
 */
export async function artistRefund(
  order: Order,
  requestedIds: string[] | undefined
): Promise<{ order: Order; proposed: boolean }> {
  if (order.status !== "DISPUTED" && !PAID_ACTIVE_STATUSES.includes(order.status)) {
    throw new HttpError(409, "Este pedido no tiene pagos para reembolsar en su estado actual");
  }
  const approved = await approvedPayments(db, order.id);
  if (approved.length === 0) throw new HttpError(409, "Este pedido no tiene pagos acreditados para reembolsar");
  const approvedIds = new Set(approved.map((p) => p.id));
  const ids = [...new Set(requestedIds ?? approved.map((p) => p.id))];
  if (ids.some((id) => !approvedIds.has(id))) throw new HttpError(400, "Alguno de los pagos elegidos no está acreditado");

  const isFull = ids.length === approved.length;
  if (isFull) {
    return { order: await cancelWithRefund(order, ids, { partial: false }), proposed: false };
  }

  // Reembolso parcial: propuesta dentro del reclamo
  if (order.status !== "DISPUTED") {
    throw new HttpError(
      409,
      "Fuera de un reclamo solo podés cancelar reembolsando todo lo cobrado. Para proponer un reembolso parcial, abrí un reclamo y acordalo con el comprador."
    );
  }
  const amount = approved.filter((p) => ids.includes(p.id)).reduce((acc, p) => acc + p.grossAmount, 0);
  const totalPaid = approved.reduce((acc, p) => acc + p.grossAmount, 0);
  await db.transaction(async (tx) => {
    const dispute = await getOpenDispute(tx, order.id);
    if (!dispute) throw new HttpError(409, "El pedido no tiene un reclamo abierto");
    await tx
      .update(orderDisputes)
      .set({ proposedRefundPaymentIds: ids, proposedAt: new Date() })
      .where(eq(orderDisputes.id, dispute.id));
    await addSystemMessage(
      tx,
      order.id,
      `🤝 El artista propone cancelar el pedido reembolsando ${money(amount)} de los ${money(totalPaid)} pagados. El comprador puede aceptar o rechazar la propuesta.`
    );
  });
  void notifyOrder(
    order,
    "buyer",
    "El artista te hizo una propuesta para cerrar el reclamo",
    `Propone cancelar el pedido reembolsando ${money(amount)} de los ${money(totalPaid)} que pagaste. Entrá a la sala del pedido para aceptarla o rechazarla.`
  );
  return { order, proposed: true };
}

export async function acceptRefundProposal(order: Order): Promise<Order> {
  const dispute = await getOpenDispute(db, order.id);
  if (!dispute?.proposedRefundPaymentIds) throw new HttpError(409, "No hay ninguna propuesta pendiente");
  return cancelWithRefund(order, dispute.proposedRefundPaymentIds, { partial: true });
}

export async function rejectRefundProposal(order: Order): Promise<void> {
  await db.transaction(async (tx) => {
    const dispute = await getOpenDispute(tx, order.id);
    if (!dispute?.proposedRefundPaymentIds) throw new HttpError(409, "No hay ninguna propuesta pendiente");
    await tx
      .update(orderDisputes)
      .set({ proposedRefundPaymentIds: null, proposedAt: null })
      .where(eq(orderDisputes.id, dispute.id));
    await addSystemMessage(tx, order.id, "✋ El comprador rechazó la propuesta de reembolso. El reclamo sigue abierto.");
  });
  void notifyOrder(order, "artist", "El comprador rechazó tu propuesta", "El reclamo sigue abierto. Podés hacer otra propuesta o esperar la mediación de TuPuestito.");
  void notifyDiscord(`✋ #${order.orderNumber}: el comprador rechazó la propuesta de reembolso. Requiere mediación.`);
}

// ─────────────────────────────────────────────────────────────
// Cierre por falta de pago (lo dispara el artista cuando venció el plazo)
// ─────────────────────────────────────────────────────────────
export async function closeUnpaidOrder(order: Order, now: Date = new Date()): Promise<Order> {
  if (!BUYER_PAYMENT_STATUSES.includes(order.status)) {
    throw new HttpError(409, "El pedido no está esperando un pago del comprador");
  }
  const deadline = new Date(order.statusChangedAt.getTime() + daysMs(config.PAYMENT_TIMEOUT_DAYS));
  if (now < deadline) {
    throw new HttpError(
      409,
      `Vas a poder cerrar el pedido por falta de pago a partir del ${deadline.toLocaleDateString("es-AR")} (${config.PAYMENT_TIMEOUT_DAYS} días sin pago).`
    );
  }
  const updated = await db.transaction((tx) =>
    cancelOrderTx(
      tx,
      order.id,
      order.status,
      `🚫 El artista cerró el pedido: el pago pendiente no se abonó en ${config.PAYMENT_TIMEOUT_DAYS} días. Los pagos anteriores corresponden al trabajo ya entregado y no se reembolsan.`
    )
  );
  void notifyOrder(
    updated,
    "buyer",
    "El pedido se cerró por falta de pago",
    `Pasaron ${config.PAYMENT_TIMEOUT_DAYS} días sin que se abonara el pago pendiente y el artista cerró el pedido. Si creés que es un error, escribinos a ${config.SUPPORT_EMAIL}.`
  );
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Mediación: decisiones del equipo de TuPuestito sobre un reclamo
// ─────────────────────────────────────────────────────────────
export type AdminDisputeAction = "RESUME" | "CANCEL" | "COMPLETE";

export async function adminResolveDispute(
  disputeId: string,
  action: AdminDisputeAction,
  admin: { id: string },
  note: string
): Promise<Order> {
  const [row] = await db
    .select({ dispute: orderDisputes, order: commissionOrders })
    .from(orderDisputes)
    .innerJoin(commissionOrders, eq(orderDisputes.orderId, commissionOrders.id))
    .where(eq(orderDisputes.id, disputeId))
    .limit(1);
  if (!row) throw new HttpError(404, "Reclamo no encontrado");
  const { dispute, order } = row;
  if (dispute.status !== "OPEN") throw new HttpError(409, "Este reclamo ya está resuelto");
  const suffix = note ? ` Nota del equipo: ${note}` : "";

  if (order.status !== "DISPUTED") {
    // Estado inconsistente (no debería pasar): cerramos el reclamo sin tocar el pedido
    await resolveOpenDisputeTx(db, order.id, "RESUMED_BY_ADMIN", { note, resolvedById: admin.id });
    return order;
  }

  if (action === "RESUME") {
    return resumeDisputedOrder(order, "RESUMED_BY_ADMIN", {
      message: `🛡️ El equipo de TuPuestito cerró el reclamo: el pedido continúa.${suffix}`,
      note,
      resolvedById: admin.id
    });
  }

  if (action === "COMPLETE") {
    const payments = await approvedPayments(db, order.id);
    const paid = payments.reduce((acc, p) => acc + p.grossAmount, 0);
    if (!order.finalHdPrivateKey) throw new HttpError(409, "El pedido no tiene una entrega final cargada");
    if (paid < order.totalAmount) throw new HttpError(409, "El pedido no está pago al 100%: no se puede liberar el original");
    const updated = await db.transaction(async (tx) => {
      const o = await transition(tx, order.id, "DISPUTED", "COMPLETED_HD_UNLOCKED", {
        completedAt: order.completedAt ?? new Date()
      });
      await resolveOpenDisputeTx(tx, order.id, "COMPLETED_BY_ADMIN", { note, resolvedById: admin.id });
      await addSystemMessage(
        tx,
        order.id,
        `🛡️ El equipo de TuPuestito cerró el reclamo: el pedido queda completado y el original disponible para descargar.${suffix}`
      );
      return o;
    });
    void notifyOrder(updated, "both", "El reclamo se cerró: pedido completado", `El equipo de TuPuestito dio el pedido por completado.${suffix}`);
    return updated;
  }

  const updated = await db.transaction(async (tx) => {
    const o = await cancelOrderTx(
      tx,
      order.id,
      "DISPUTED",
      `🛡️ El equipo de TuPuestito cerró el reclamo: el pedido queda cancelado.${suffix} ${MP_CLAIM_HINT}`
    );
    await resolveOpenDisputeTx(tx, order.id, "CANCELLED_BY_ADMIN", { note, resolvedById: admin.id });
    return o;
  });
  void notifyOrder(
    updated,
    "both",
    "El reclamo se cerró: pedido cancelado",
    `El equipo de TuPuestito canceló el pedido.${suffix}\n${MP_CLAIM_HINT}`
  );
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Suspensión de una cuenta: sus pedidos no pueden quedar corriendo solos
// ─────────────────────────────────────────────────────────────
/**
 * Los pedidos sin pagos se cancelan; los que ya tienen pagos pasan a reclamo para que una persona
 * del equipo decida qué hacer con cada uno.
 */
export async function pauseOrdersOfSuspendedUser(userId: string): Promise<{ cancelled: number; disputed: number }> {
  const [profile] = await db.select({ id: artistProfiles.id }).from(artistProfiles).where(eq(artistProfiles.userId, userId)).limit(1);
  const mine = profile
    ? or(eq(commissionOrders.buyerId, userId), eq(commissionOrders.artistId, profile.id))
    : eq(commissionOrders.buyerId, userId);
  const orders = await db
    .select()
    .from(commissionOrders)
    .where(
      and(mine, inArray(commissionOrders.status, ["REQUESTED", "ACCEPTED_WAITING_DEPOSIT", ...PAID_ACTIVE_STATUSES]))
    );

  let cancelled = 0;
  let disputed = 0;
  for (const order of orders) {
    try {
      if (order.status === "REQUESTED" || order.status === "ACCEPTED_WAITING_DEPOSIT") {
        const o = await db.transaction((tx) =>
          cancelOrderTx(tx, order.id, order.status, "🚫 El pedido se canceló porque una de las cuentas fue suspendida por moderación. No se realizó ningún cobro.")
        );
        void notifyOrder(o, "both", "Pedido cancelado", "El pedido se canceló porque una de las cuentas fue suspendida. No se realizó ningún cobro.");
        cancelled += 1;
      } else {
        const { order: o } = await db.transaction((tx) =>
          openDisputeTx(tx, order, {
            openedById: null,
            openerRole: "SYSTEM",
            reason: "ACCOUNT_SUSPENDED",
            description: "Una de las cuentas de este pedido fue suspendida por moderación. El equipo de TuPuestito va a revisar cómo sigue."
          })
        );
        void notifyOrder(o, "both", "Pedido en pausa", "Una de las cuentas de este pedido fue suspendida. El pedido queda en pausa mientras el equipo de TuPuestito lo revisa.");
        disputed += 1;
      }
    } catch (err) {
      console.error("[moderación] No se pudo pausar el pedido", order.orderNumber, err);
    }
  }
  return { cancelled, disputed };
}
