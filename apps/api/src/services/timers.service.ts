import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { commissionOrders } from "../db/schema.js";
import { config } from "../config.js";
import { notifyDiscord } from "./notification.service.js";
import {
  ARTIST_WORK_STATUSES,
  BUYER_PAYMENT_STATUSES,
  BUYER_REVIEW_STATUSES,
  addSystemMessage,
  approveFinalPreview,
  approveMilestone,
  approveSketch,
  daysMs,
  notifyOrder,
  type Order,
  type OrderStatus
} from "./order.service.js";

/**
 * Plazos automáticos: ningún pedido queda trancado esperando para siempre a una de las partes.
 *
 *   Solicitud sin responder   → recordatorio al artista → vence sola
 *   Pago inicial              → recordatorio → vence a las 72 hs (libera el cupo)
 *   Entrega sin revisar       → recordatorio al comprador → se aprueba sola
 *   Pago intermedio pendiente → recordatorios → el artista queda habilitado a cerrar el pedido
 *   Entrega atrasada          → aviso a las dos partes → aviso a moderación
 *
 * Cada paso es un UPDATE condicional (estado + `reminder_stage`), así que correrlo dos veces, o
 * desde dos instancias a la vez, no manda avisos duplicados. Recibe `now` para poder probarlo.
 */
export interface TimerReport {
  expiredDeposits: number;
  depositReminders: number;
  expiredRequests: number;
  requestReminders: number;
  reviewReminders: number;
  autoApproved: number;
  paymentReminders: number;
  paymentTimeouts: number;
  overdueNotices: number;
  overdueEscalations: number;
}

const BATCH = 200;
const fmtDate = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
const before = (now: Date, ms: number) => new Date(now.getTime() - ms);

/** Reserva el aviso: solo devuelve el pedido si sigue en ese estado y todavía no se había avisado */
async function claim(orderId: string, statuses: OrderStatus[], belowStage: number, newStage: number): Promise<Order | null> {
  const [order] = await db
    .update(commissionOrders)
    .set({
      reminderStage: newStage,
      // Un recordatorio no es actividad del pedido: no lo sube en los listados
      updatedAt: sql`${commissionOrders.updatedAt}`
    })
    .where(
      and(
        eq(commissionOrders.id, orderId),
        inArray(commissionOrders.status, statuses),
        lt(commissionOrders.reminderStage, belowStage)
      )
    )
    .returning();
  return order ?? null;
}

function candidates(statuses: OrderStatus[], belowStage: number, changedBefore: Date) {
  return db
    .select({ id: commissionOrders.id })
    .from(commissionOrders)
    .where(
      and(
        inArray(commissionOrders.status, statuses),
        lt(commissionOrders.reminderStage, belowStage),
        lt(commissionOrders.statusChangedAt, changedBefore)
      )
    )
    .limit(BATCH);
}

/** Vence un pedido que nunca llegó a tener pagos */
async function expire(orderId: string, from: OrderStatus, changedBefore: Date | null, acceptedBefore: Date | null): Promise<Order | null> {
  const [order] = await db
    .update(commissionOrders)
    .set({ status: "EXPIRED", statusChangedAt: sql`now()`, reminderStage: 0 })
    .where(
      and(
        eq(commissionOrders.id, orderId),
        eq(commissionOrders.status, from),
        changedBefore ? lt(commissionOrders.statusChangedAt, changedBefore) : undefined,
        acceptedBefore ? lt(commissionOrders.acceptedAt, acceptedBefore) : undefined
      )
    )
    .returning();
  return order ?? null;
}

export async function runOrderTimers(now: Date = new Date()): Promise<TimerReport> {
  const report: TimerReport = {
    expiredDeposits: 0,
    depositReminders: 0,
    expiredRequests: 0,
    requestReminders: 0,
    reviewReminders: 0,
    autoApproved: 0,
    paymentReminders: 0,
    paymentTimeouts: 0,
    overdueNotices: 0,
    overdueEscalations: 0
  };

  // ── 1. Pago inicial: vence a las DEPOSIT_EXPIRATION_HOURS (Plan §4) ──
  const depositMs = config.DEPOSIT_EXPIRATION_HOURS * 3600_000;
  const unpaid = await db
    .select({ id: commissionOrders.id })
    .from(commissionOrders)
    .where(and(eq(commissionOrders.status, "ACCEPTED_WAITING_DEPOSIT"), lt(commissionOrders.acceptedAt, before(now, depositMs))))
    .limit(BATCH);
  for (const { id } of unpaid) {
    const order = await expire(id, "ACCEPTED_WAITING_DEPOSIT", null, before(now, depositMs));
    if (!order) continue;
    await addSystemMessage(db, order.id, `⌛ El pedido venció: no se registró el pago inicial dentro de las ${config.DEPOSIT_EXPIRATION_HOURS} hs.`);
    void notifyOrder(order, "both", "Pedido vencido", "No se registró el pago inicial a tiempo y el pedido venció. El cupo quedó liberado.");
    report.expiredDeposits += 1;
  }
  // Recordatorio cuando queda un tercio del plazo
  const depositReminder = await db
    .select({ id: commissionOrders.id })
    .from(commissionOrders)
    .where(
      and(
        eq(commissionOrders.status, "ACCEPTED_WAITING_DEPOSIT"),
        lt(commissionOrders.reminderStage, 1),
        lt(commissionOrders.acceptedAt, before(now, (depositMs * 2) / 3))
      )
    )
    .limit(BATCH);
  for (const { id } of depositReminder) {
    const order = await claim(id, ["ACCEPTED_WAITING_DEPOSIT"], 1, 1);
    if (!order?.acceptedAt) continue;
    const deadline = new Date(order.acceptedAt.getTime() + depositMs);
    void notifyOrder(
      order,
      "buyer",
      "Tu pedido está por vencer",
      `El artista aceptó tu comisión, pero todavía falta el pago inicial. Si no se abona antes del ${deadline.toLocaleString("es-AR")}, el pedido vence y se libera el cupo.`
    );
    report.depositReminders += 1;
  }

  // ── 2. Solicitudes que el artista no responde ──
  const requestMs = daysMs(config.REQUEST_EXPIRATION_DAYS);
  for (const { id } of await candidates(["REQUESTED"], 99, before(now, requestMs))) {
    const order = await expire(id, "REQUESTED", before(now, requestMs), null);
    if (!order) continue;
    await addSystemMessage(
      db,
      order.id,
      `⌛ La solicitud venció: el artista no respondió en ${config.REQUEST_EXPIRATION_DAYS} días. No se realizó ningún cobro.`
    );
    void notifyOrder(order, "both", "Solicitud vencida", `La solicitud venció porque no hubo respuesta en ${config.REQUEST_EXPIRATION_DAYS} días. No se realizó ningún cobro.`);
    report.expiredRequests += 1;
  }
  for (const { id } of await candidates(["REQUESTED"], 1, before(now, requestMs / 2))) {
    const order = await claim(id, ["REQUESTED"], 1, 1);
    if (!order) continue;
    const deadline = new Date(order.statusChangedAt.getTime() + requestMs);
    void notifyOrder(
      order,
      "artist",
      "Tenés una solicitud sin responder",
      `Hay una solicitud de comisión esperando tu respuesta. Si no la aceptás o rechazás antes del ${fmtDate(deadline)}, vence sola.`
    );
    report.requestReminders += 1;
  }

  // ── 3. Entregas sin revisar: se aprueban solas ──
  const reviewMs = daysMs(config.REVIEW_AUTO_APPROVE_DAYS);
  const autoApprove = await db
    .select()
    .from(commissionOrders)
    .where(and(inArray(commissionOrders.status, BUYER_REVIEW_STATUSES), lt(commissionOrders.statusChangedAt, before(now, reviewMs))))
    .limit(BATCH);
  for (const order of autoApprove) {
    try {
      if (order.status === "SKETCH_REVIEW") await approveSketch(order, "auto");
      else if (order.status === "FINAL_PREVIEW_REVIEW") await approveFinalPreview(order, "auto");
      else await approveMilestone(order, "auto");
      report.autoApproved += 1;
    } catch (err) {
      // 409 = otra instancia o el propio comprador lo resolvió recién
      if ((err as { statusCode?: number }).statusCode !== 409) console.error("[plazos] Falló la aprobación automática", order.orderNumber, err);
    }
  }
  // Recordatorio 2 días antes (o a mitad del plazo si es más corto)
  const reviewLead = Math.min(daysMs(2), reviewMs / 2);
  for (const { id } of await candidates(BUYER_REVIEW_STATUSES, 1, before(now, reviewMs - reviewLead))) {
    const order = await claim(id, BUYER_REVIEW_STATUSES, 1, 1);
    if (!order) continue;
    const deadline = new Date(order.statusChangedAt.getTime() + reviewMs);
    void notifyOrder(
      order,
      "buyer",
      "Tenés una entrega sin revisar",
      `El artista te entregó un avance y está esperando tu respuesta. Si no lo aprobás o pedís cambios antes del ${fmtDate(deadline)}, se va a aprobar automáticamente.`
    );
    report.reviewReminders += 1;
  }

  // ── 4. Pagos intermedios pendientes ──
  const paymentMs = daysMs(config.PAYMENT_TIMEOUT_DAYS);
  for (const { id } of await candidates(BUYER_PAYMENT_STATUSES, 3, before(now, paymentMs))) {
    const order = await claim(id, BUYER_PAYMENT_STATUSES, 3, 3);
    if (!order) continue;
    void notifyOrder(
      order,
      "artist",
      "Podés cerrar el pedido por falta de pago",
      `Pasaron ${config.PAYMENT_TIMEOUT_DAYS} días sin que el comprador abone el pago pendiente. Desde la sala del pedido podés cerrarlo para liberar el cupo, o esperar si ya lo hablaron.`
    );
    void notifyOrder(
      order,
      "buyer",
      "Tu pedido puede cerrarse por falta de pago",
      `Pasaron ${config.PAYMENT_TIMEOUT_DAYS} días sin el pago pendiente. El artista ya puede cerrar el pedido; si querés continuar, aboná desde la sala del pedido.`
    );
    report.paymentTimeouts += 1;
  }
  for (const [stage, fraction] of [
    [2, 2 / 3],
    [1, 1 / 3]
  ] as const) {
    const wait = Math.min(paymentMs * fraction, daysMs(stage === 1 ? 3 : 7));
    for (const { id } of await candidates(BUYER_PAYMENT_STATUSES, stage, before(now, wait))) {
      const order = await claim(id, BUYER_PAYMENT_STATUSES, stage, stage);
      if (!order) continue;
      const deadline = new Date(order.statusChangedAt.getTime() + paymentMs);
      void notifyOrder(
        order,
        "buyer",
        "Tenés un pago pendiente",
        `Tu pedido está esperando el pago de la siguiente etapa para continuar. Si no se abona antes del ${fmtDate(deadline)}, el artista puede cerrar el pedido.`
      );
      report.paymentReminders += 1;
    }
  }

  // ── 5. Entregas atrasadas ──
  const escalationMs = daysMs(config.OVERDUE_ESCALATION_DAYS);
  const overdue = (belowStage: number, dueBefore: Date) =>
    db
      .select({ id: commissionOrders.id })
      .from(commissionOrders)
      .where(
        and(
          inArray(commissionOrders.status, ARTIST_WORK_STATUSES),
          lt(commissionOrders.reminderStage, belowStage),
          isNotNull(commissionOrders.workDueAt),
          lt(commissionOrders.workDueAt, dueBefore)
        )
      )
      .limit(BATCH);
  for (const { id } of await overdue(2, before(now, escalationMs))) {
    const order = await claim(id, ARTIST_WORK_STATUSES, 2, 2);
    if (!order) continue;
    void notifyDiscord(
      `🐢 #${order.orderNumber} lleva más de ${config.OVERDUE_ESCALATION_DAYS} días de atraso (estado ${order.status}, vencía el ${order.workDueAt?.toLocaleDateString("es-AR")}).`
    );
    void notifyOrder(
      order,
      "buyer",
      "Tu pedido sigue atrasado",
      `La entrega lleva más de ${config.OVERDUE_ESCALATION_DAYS} días de atraso. Si el artista no te responde, podés abrir un reclamo desde la sala del pedido y el equipo de TuPuestito interviene.`
    );
    report.overdueEscalations += 1;
  }
  for (const { id } of await overdue(1, now)) {
    const order = await claim(id, ARTIST_WORK_STATUSES, 1, 1);
    if (!order) continue;
    void notifyOrder(
      order,
      "artist",
      "Venció el plazo estimado de entrega",
      "El plazo estimado de esta entrega ya pasó. Subila cuanto antes o contale al comprador por el chat cómo venís."
    );
    void notifyOrder(
      order,
      "buyer",
      "Venció el plazo estimado de entrega",
      "El plazo estimado de la entrega ya pasó. Podés consultarle al artista por el chat del pedido; si no responde, podés abrir un reclamo desde la sala del pedido."
    );
    report.overdueNotices += 1;
  }

  return report;
}

/** ¿Hubo algo para informar? */
export function hasActivity(report: TimerReport): boolean {
  return Object.values(report).some((n) => n > 0);
}
