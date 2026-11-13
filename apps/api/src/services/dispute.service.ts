import { and, desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "../db/index.js";
import { orderDisputes } from "../db/schema.js";
import { config } from "../config.js";
import { PAID_ACTIVE_STATUSES, addSystemMessage, daysMs, transition, type Order } from "./order.service.js";

export type Dispute = typeof orderDisputes.$inferSelect;
export type DisputeReason = Dispute["reason"];
export type DisputeResolution = NonNullable<Dispute["resolution"]>;
export type DisputeParty = Dispute["openerRole"];

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  ARTIST_UNRESPONSIVE: "el artista no responde",
  BUYER_UNRESPONSIVE: "el comprador no responde",
  LATE_DELIVERY: "la entrega está atrasada",
  NOT_AS_AGREED: "lo entregado no es lo acordado",
  WANTS_TO_CANCEL: "quiere cancelar el pedido",
  PAYMENT_PROBLEM: "hay un problema con un pago",
  ABUSIVE_BEHAVIOR: "trato abusivo o inapropiado",
  OTHER: "otro motivo",
  PROVIDER_CLAIM: "Mercado Pago informó un reclamo o contracargo",
  ACCOUNT_SUSPENDED: "una de las cuentas fue suspendida"
};

/** Motivos que puede elegir cada parte al abrir un reclamo */
export const USER_DISPUTE_REASONS: Record<"BUYER" | "ARTIST", DisputeReason[]> = {
  BUYER: ["ARTIST_UNRESPONSIVE", "LATE_DELIVERY", "NOT_AS_AGREED", "WANTS_TO_CANCEL", "PAYMENT_PROBLEM", "ABUSIVE_BEHAVIOR", "OTHER"],
  ARTIST: ["BUYER_UNRESPONSIVE", "WANTS_TO_CANCEL", "PAYMENT_PROBLEM", "ABUSIVE_BEHAVIOR", "OTHER"]
};

/**
 * Se puede reclamar mientras el pedido está en curso y tiene al menos un pago acreditado.
 * Después de la entrega final, el comprador conserva una ventana para reclamar.
 */
export function canOpenDispute(
  order: Pick<Order, "status" | "completedAt">,
  role: "BUYER" | "ARTIST",
  now: Date = new Date()
): boolean {
  if (PAID_ACTIVE_STATUSES.includes(order.status)) return true;
  if (role === "BUYER" && order.status === "COMPLETED_HD_UNLOCKED" && order.completedAt) {
    return now.getTime() <= order.completedAt.getTime() + daysMs(config.POST_DELIVERY_DISPUTE_DAYS);
  }
  return false;
}

export async function getOpenDispute(tx: DbOrTx, orderId: string): Promise<Dispute | null> {
  const [dispute] = await tx
    .select()
    .from(orderDisputes)
    .where(and(eq(orderDisputes.orderId, orderId), eq(orderDisputes.status, "OPEN")))
    .limit(1);
  return dispute ?? null;
}

/** El reclamo abierto o, si no hay, el último resuelto (para mostrar cómo terminó) */
export async function getLatestDispute(orderId: string): Promise<Dispute | null> {
  const [dispute] = await db
    .select()
    .from(orderDisputes)
    .where(eq(orderDisputes.orderId, orderId))
    .orderBy(desc(orderDisputes.createdAt))
    .limit(1);
  return dispute ?? null;
}

/** Abre un reclamo y pone el pedido en pausa (DISPUTED). Atómico respecto del estado del pedido. */
export async function openDisputeTx(
  tx: DbOrTx,
  order: Order,
  params: { openedById: string | null; openerRole: DisputeParty; reason: DisputeReason; description: string }
): Promise<{ order: Order; dispute: Dispute }> {
  const updated = await transition(tx, order.id, order.status, "DISPUTED");
  const [dispute] = await tx
    .insert(orderDisputes)
    .values({
      orderId: order.id,
      openedById: params.openedById,
      openerRole: params.openerRole,
      reason: params.reason,
      description: params.description,
      statusBefore: order.status
    })
    .returning();
  const who =
    params.openerRole === "BUYER" ? "El comprador" : params.openerRole === "ARTIST" ? "El artista" : "TuPuestito";
  await addSystemMessage(
    tx,
    order.id,
    `⚠️ ${who} abrió un reclamo (${DISPUTE_REASON_LABEL[params.reason]}). El pedido queda en pausa hasta que se resuelva. ` +
      "Pueden seguir hablando por este hilo; el equipo de TuPuestito ya fue avisado."
  );
  return { order: updated, dispute: dispute! };
}

/** Cierra el reclamo abierto del pedido, si lo hay */
export async function resolveOpenDisputeTx(
  tx: DbOrTx,
  orderId: string,
  resolution: DisputeResolution,
  opts: { note?: string | null; resolvedById?: string | null } = {}
): Promise<Dispute | null> {
  const [dispute] = await tx
    .update(orderDisputes)
    .set({
      status: "RESOLVED",
      resolution,
      resolutionNote: opts.note ?? null,
      resolvedById: opts.resolvedById ?? null,
      resolvedAt: new Date()
    })
    .where(and(eq(orderDisputes.orderId, orderId), eq(orderDisputes.status, "OPEN")))
    .returning();
  return dispute ?? null;
}
