import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../db/index.js";
import {
  artistProfiles,
  commissionOrders,
  orderMessages,
  orderMilestonePayments,
  users,
  type OrderMilestone,
  type ServiceMilestone
} from "../db/schema.js";
import { config } from "../config.js";
import { sendEmail, html } from "./notification.service.js";
import { HttpError } from "../lib/http.js";

export type Order = typeof commissionOrders.$inferSelect;
export type OrderStatus = Order["status"];
export type PaymentPlan = Order["paymentPlanSnapshot"];
export type MilestoneStage = (typeof orderMilestonePayments.$inferSelect)["stage"];

const PLAN_LABEL: Record<Exclude<PaymentPlan, "MILESTONES">, string> = {
  FULL_100: "100% al inicio",
  SPLIT_ON_SKETCH: "50% de seña al aceptar el pedido y 50% al aprobar el boceto",
  SPLIT_ON_FINAL_PREVIEW: "50% de seña al aceptar el pedido y 50% al aprobar la vista previa final con marca de agua"
};

/** Texto de la modalidad de pago que acepta el comprador (queda en el snapshot de términos) */
export function planLabel(plan: PaymentPlan, milestones: Pick<ServiceMilestone, "title" | "percent">[] = []): string {
  if (plan !== "MILESTONES") return PLAN_LABEL[plan];
  const list = milestones.map((m, i) => `${i + 1}) ${m.title} — ${m.percent}%`).join("; ");
  return `pago en ${milestones.length} etapas, cada una se abona antes de que el artista la empiece: ${list}`;
}

/** Reglas de plazos de la plataforma que el comprador acepta junto con los términos del artista */
export function platformRulesText(): string {
  return [
    "Reglas de TuPuestito que aplican a este pedido:",
    `• Si el comprador no revisa una entrega dentro de los ${config.REVIEW_AUTO_APPROVE_DAYS} días, se considera aprobada.`,
    `• Si el comprador no abona una etapa dentro de los ${config.PAYMENT_TIMEOUT_DAYS} días, el artista puede cerrar el pedido sin reembolso de lo ya trabajado.`,
    "• Con un pago acreditado, cualquiera de las partes puede abrir un reclamo desde la sala del pedido; mientras esté abierto, el pedido queda en pausa.",
    "• TuPuestito no retiene el dinero: los reembolsos los emite el artista a través de Mercado Pago."
  ].join("\n");
}

/** Convierte las etapas del servicio en montos en pesos; la última absorbe el redondeo */
export function buildOrderMilestones(milestones: ServiceMilestone[], totalAmount: number): OrderMilestone[] {
  let assigned = 0;
  return milestones.map((m, i) => {
    const amount = i === milestones.length - 1 ? totalAmount - assigned : Math.round((totalAmount * m.percent) / 100);
    assigned += amount;
    return { ...m, amount };
  });
}

/** Estados en los que el pedido ya no admite acciones */
export const TERMINAL_STATUSES: OrderStatus[] = ["REJECTED", "EXPIRED", "CANCELLED", "COMPLETED_HD_UNLOCKED"];
/** Estados que ocupan un cupo (max_slots) del servicio. Un pedido en reclamo no ocupa cupo. */
export const SLOT_STATUSES: OrderStatus[] = [
  "ACCEPTED_WAITING_DEPOSIT",
  "IN_PROGRESS_SKETCH",
  "SKETCH_REVIEW",
  "WAITING_PAYMENT_AFTER_SKETCH",
  "WORKING_FINAL",
  "FINAL_PREVIEW_REVIEW",
  "WAITING_PAYMENT_BEFORE_HD",
  "MILESTONE_WAITING_PAYMENT",
  "MILESTONE_IN_PROGRESS",
  "MILESTONE_REVIEW"
];
/** Le toca trabajar al artista: corre su plazo de entrega */
export const ARTIST_WORK_STATUSES: OrderStatus[] = ["IN_PROGRESS_SKETCH", "WORKING_FINAL", "MILESTONE_IN_PROGRESS"];
/** El comprador tiene que revisar una entrega: corre el plazo de aprobación automática */
export const BUYER_REVIEW_STATUSES: OrderStatus[] = ["SKETCH_REVIEW", "FINAL_PREVIEW_REVIEW", "MILESTONE_REVIEW"];
/** El comprador tiene que pagar para que el pedido siga (ya hubo pagos antes) */
export const BUYER_PAYMENT_STATUSES: OrderStatus[] = [
  "WAITING_PAYMENT_AFTER_SKETCH",
  "WAITING_PAYMENT_BEFORE_HD",
  "MILESTONE_WAITING_PAYMENT"
];
/** Pedidos en curso con al menos un pago acreditado: admiten reclamo y cancelación con reembolso */
export const PAID_ACTIVE_STATUSES: OrderStatus[] = [
  ...ARTIST_WORK_STATUSES,
  ...BUYER_REVIEW_STATUSES,
  ...BUYER_PAYMENT_STATUSES
];
/** Estados en los que la próxima acción es del comprador / del artista (para "te toca a vos") */
export const BUYER_ACTION_STATUSES: OrderStatus[] = [
  "ACCEPTED_WAITING_DEPOSIT",
  ...BUYER_REVIEW_STATUSES,
  ...BUYER_PAYMENT_STATUSES
];
export const ARTIST_ACTION_STATUSES: OrderStatus[] = ["REQUESTED", ...ARTIST_WORK_STATUSES];

const DAY_MS = 86_400_000;
export const daysMs = (n: number) => n * DAY_MS;

/** Fechas límite que rigen el estado actual del pedido (null cuando no aplican) */
export function orderDeadlines(
  order: Pick<Order, "status" | "statusChangedAt" | "acceptedAt" | "workDueAt" | "completedAt">
) {
  const since = order.statusChangedAt.getTime();
  return {
    depositExpiresAt:
      order.status === "ACCEPTED_WAITING_DEPOSIT" && order.acceptedAt
        ? new Date(order.acceptedAt.getTime() + config.DEPOSIT_EXPIRATION_HOURS * 3600_000)
        : null,
    requestExpiresAt: order.status === "REQUESTED" ? new Date(since + daysMs(config.REQUEST_EXPIRATION_DAYS)) : null,
    reviewAutoApproveAt: BUYER_REVIEW_STATUSES.includes(order.status)
      ? new Date(since + daysMs(config.REVIEW_AUTO_APPROVE_DAYS))
      : null,
    paymentTimeoutAt: BUYER_PAYMENT_STATUSES.includes(order.status)
      ? new Date(since + daysMs(config.PAYMENT_TIMEOUT_DAYS))
      : null,
    workDueAt: ARTIST_WORK_STATUSES.includes(order.status) ? order.workDueAt : null,
    disputeWindowEndsAt:
      order.status === "COMPLETED_HD_UNLOCKED" && order.completedAt
        ? new Date(order.completedAt.getTime() + daysMs(config.POST_DELIVERY_DISPUTE_DAYS))
        : null
  };
}

/** Cálculo de montos y fee (Plan Sprint 5: marketplace_fee 5%) */
export function computeAmounts(plan: PaymentPlan, totalAmount: number, milestones: OrderMilestone[] = []) {
  const platformFeeAmount = Math.round(totalAmount * config.PLATFORM_FEE_RATE);
  if (plan === "FULL_100") {
    return { platformFeeAmount, depositAmount: totalAmount, finalAmount: 0 };
  }
  if (plan === "MILESTONES") {
    // El "depósito" es la primera etapa: es lo que hay que pagar dentro de las 72 hs
    const first = milestones[0]?.amount ?? totalAmount;
    return { platformFeeAmount, depositAmount: first, finalAmount: totalAmount - first };
  }
  const depositAmount = Math.round(totalAmount / 2);
  return { platformFeeAmount, depositAmount, finalAmount: totalAmount - depositAmount };
}

/** Fee de una etapa (plan MILESTONES): la última completa el fee total exacto del pedido */
export function milestoneStageFee(order: Pick<Order, "milestonesSnapshot" | "platformFeeAmount">, index: number): number {
  const fees = order.milestonesSnapshot.map((m) => Math.round(m.amount * config.PLATFORM_FEE_RATE));
  if (index < fees.length - 1) return fees[index] ?? 0;
  return order.platformFeeAmount - fees.slice(0, -1).reduce((a, b) => a + b, 0);
}

export interface PendingPayment {
  stage: MilestoneStage;
  /** Índice de etapa (0 salvo en stage = MILESTONE) */
  milestoneIndex: number;
  amount: number;
  fee: number;
  /** Parte neutra del concepto de cobro */
  concept: string;
}

type PaymentContext = Pick<
  Order,
  | "status"
  | "paymentPlanSnapshot"
  | "milestonesSnapshot"
  | "currentMilestone"
  | "depositAmount"
  | "finalAmount"
  | "platformFeeAmount"
>;

/** Qué pago corresponde al estado actual del pedido (o null si no hay ninguno pendiente) */
export function pendingPayment(order: PaymentContext): PendingPayment | null {
  if (order.paymentPlanSnapshot === "MILESTONES") {
    if (order.status !== "ACCEPTED_WAITING_DEPOSIT" && order.status !== "MILESTONE_WAITING_PAYMENT") return null;
    const index = order.status === "ACCEPTED_WAITING_DEPOSIT" ? 0 : order.currentMilestone;
    const milestone = order.milestonesSnapshot[index];
    if (!milestone) return null;
    return {
      stage: "MILESTONE",
      milestoneIndex: index,
      amount: milestone.amount,
      fee: milestoneStageFee(order, index),
      concept: `etapa ${index + 1} de ${order.milestonesSnapshot.length}`
    };
  }
  const depositFee = Math.round(order.depositAmount * config.PLATFORM_FEE_RATE);
  switch (order.status) {
    case "ACCEPTED_WAITING_DEPOSIT":
      return order.paymentPlanSnapshot === "FULL_100"
        ? { stage: "FULL_100", milestoneIndex: 0, amount: order.depositAmount, fee: order.platformFeeAmount, concept: "pago total" }
        : { stage: "DEPOSIT_50", milestoneIndex: 0, amount: order.depositAmount, fee: depositFee, concept: "seña 50%" };
    case "WAITING_PAYMENT_AFTER_SKETCH":
    case "WAITING_PAYMENT_BEFORE_HD":
      return {
        stage: "FINAL_50",
        milestoneIndex: 0,
        amount: order.finalAmount,
        fee: order.platformFeeAmount - depositFee,
        concept: "saldo 50%"
      };
    default:
      return null;
  }
}

/** Concepto neutro para Mercado Pago (Plan §2) */
export function neutralTitle(orderNumber: string, artistUsername: string, concept: string) {
  return `Encargo de ilustración digital #${orderNumber} — @${artistUsername} (${concept})`;
}

export async function addSystemMessage(tx: DbOrTx, orderId: string, content: string) {
  await tx.insert(orderMessages).values({ orderId, senderId: null, type: "SYSTEM_EVENT", content });
}

/**
 * Transición atómica: solo cambia si el estado actual sigue siendo `from`.
 * Evita carreras (doble clic, webhook duplicado, etc.).
 *
 * Además reinicia los plazos del nuevo estado y mantiene `workDueAt`: el plazo de entrega del
 * artista solo corre mientras el pedido está en sus manos, así que se corre hacia adelante todo
 * el tiempo que el pedido pasó esperando al comprador (o en reclamo).
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
    .set({
      workDueAt: sql`case when ${commissionOrders.status} in ('IN_PROGRESS_SKETCH', 'WORKING_FINAL', 'MILESTONE_IN_PROGRESS')
        then ${commissionOrders.workDueAt}
        else ${commissionOrders.workDueAt} + (now() - ${commissionOrders.statusChangedAt}) end`,
      ...extra,
      status: to,
      statusChangedAt: sql`now()`,
      reminderStage: 0
    })
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
    .select({ id: users.id, email: users.email, name: users.name, username: users.username, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, order.buyerId));
  const [artist] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      deletedAt: users.deletedAt,
      profileId: artistProfiles.id
    })
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
  try {
    const parties = await orderParties(order);
    const url = `${config.WEB_URL}/orders/${order.id}`;
    const recipients = (to === "both" ? [parties.buyer, parties.artist] : [parties[to]]).filter(
      (r) => r && !r.deletedAt
    );
    await Promise.all(
      recipients.map((r) =>
        sendEmail({
          to: r.email,
          subject: `${subject} · #${order.orderNumber}`,
          title: subject,
          html: `<p>Hola ${html.escape(r.name)},</p><p>${html.escape(message).replace(/\n/g, "<br/>")}</p>`,
          cta: { label: "Abrir sala del pedido", url }
        })
      )
    );
  } catch (err) {
    console.error("[notify] No se pudo enviar el aviso del pedido", order.orderNumber, err);
  }
}

// ─────────────────────────────────────────────────────────────
// Aprobaciones del comprador. `auto` = el plazo de revisión venció y se aprueba sola.
// ─────────────────────────────────────────────────────────────
export type ApprovalActor = "buyer" | "auto";

const autoNote = () =>
  `⏱️ Aprobación automática: pasaron ${config.REVIEW_AUTO_APPROVE_DAYS} días sin respuesta del comprador. `;

export async function approveSketch(order: Order, actor: ApprovalActor = "buyer"): Promise<Order> {
  const next = order.paymentPlanSnapshot === "SPLIT_ON_SKETCH" ? "WAITING_PAYMENT_AFTER_SKETCH" : "WORKING_FINAL";
  const updated = await db.transaction(async (tx) => {
    const o = await transition(tx, order.id, "SKETCH_REVIEW", next);
    await addSystemMessage(
      tx,
      order.id,
      (actor === "auto" ? autoNote() : "") +
        (next === "WAITING_PAYMENT_AFTER_SKETCH"
          ? "✅ Boceto aprobado. Próximo paso: abonar el 50% restante para que el artista pase a línea y color."
          : "✅ Boceto aprobado. El artista continúa con la obra final.")
    );
    return o;
  });
  void notifyOrder(
    updated,
    actor === "auto" ? "both" : "artist",
    actor === "auto" ? "Boceto aprobado automáticamente" : "¡Boceto aprobado!",
    next === "WAITING_PAYMENT_AFTER_SKETCH"
      ? "El boceto quedó aprobado. El comprador tiene que abonar el 50% restante para que el pedido siga."
      : "El boceto quedó aprobado. El artista ya puede avanzar con la obra final."
  );
  return updated;
}

export async function approveFinalPreview(order: Order, actor: ApprovalActor = "buyer"): Promise<Order> {
  const updated = await db.transaction(async (tx) => {
    const o = await transition(tx, order.id, "FINAL_PREVIEW_REVIEW", "WAITING_PAYMENT_BEFORE_HD");
    await addSystemMessage(
      tx,
      order.id,
      (actor === "auto" ? autoNote() : "") +
        "✅ Vista previa final aprobada. Al acreditarse el 50% restante se desbloquea el original HD sin marca de agua."
    );
    return o;
  });
  void notifyOrder(
    updated,
    actor === "auto" ? "both" : "artist",
    actor === "auto" ? "Vista previa aprobada automáticamente" : "Vista previa aprobada",
    "La obra final quedó aprobada. El comprador tiene que abonar el saldo para descargar el original."
  );
  return updated;
}

export async function approveMilestone(order: Order, actor: ApprovalActor = "buyer"): Promise<Order> {
  const index = order.currentMilestone;
  const total = order.milestonesSnapshot.length;
  const isLast = index === total - 1;
  const nextMilestone = order.milestonesSnapshot[index + 1];

  const updated = await db.transaction(async (tx) => {
    if (isLast) {
      // Todas las etapas se pagan por adelantado: verificamos el 100% antes de liberar el original
      const payments = await tx.select().from(orderMilestonePayments).where(eq(orderMilestonePayments.orderId, order.id));
      const paid = payments.filter((p) => p.status === "APPROVED").reduce((acc, p) => acc + p.grossAmount, 0);
      if (paid < order.totalAmount) throw new HttpError(409, "Todavía hay etapas sin pagar");
      const o = await transition(tx, order.id, "MILESTONE_REVIEW", "COMPLETED_HD_UNLOCKED", { completedAt: new Date() });
      await addSystemMessage(
        tx,
        order.id,
        (actor === "auto" ? autoNote() : "") + "🎉 Etapa final aprobada. ¡Se desbloqueó la descarga del archivo original!"
      );
      return o;
    }
    const o = await transition(tx, order.id, "MILESTONE_REVIEW", "MILESTONE_WAITING_PAYMENT", { currentMilestone: index + 1 });
    await addSystemMessage(
      tx,
      order.id,
      (actor === "auto" ? autoNote() : "") +
        `✅ Etapa ${index + 1}/${total} aprobada. Próximo paso: abonar la etapa ${index + 2} ("${nextMilestone!.title}", $${nextMilestone!.amount.toLocaleString("es-AR")} ARS) para que el artista la empiece.`
    );
    return o;
  });
  void notifyOrder(
    updated,
    actor === "auto" ? "both" : "artist",
    isLast ? "¡Pedido completado!" : `Etapa ${index + 1} aprobada`,
    isLast
      ? "La etapa final quedó aprobada y el original ya se puede descargar."
      : "La etapa quedó aprobada. El comprador tiene que abonar la siguiente para que el pedido siga."
  );
  return updated;
}

/** Cancela un pedido en curso y anula sus cobros pendientes */
export async function cancelOrderTx(tx: DbOrTx, orderId: string, from: OrderStatus | OrderStatus[], message: string): Promise<Order> {
  const order = await transition(tx, orderId, from, "CANCELLED");
  await tx
    .update(orderMilestonePayments)
    .set({ status: "REJECTED" })
    .where(and(eq(orderMilestonePayments.orderId, orderId), eq(orderMilestonePayments.status, "PENDING")));
  await addSystemMessage(tx, orderId, message);
  return order;
}

export async function nextOrderNumber(tx: DbOrTx): Promise<string> {
  const res = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq')::text as n`);
  return `PST-${res.rows[0]!.n}`;
}
