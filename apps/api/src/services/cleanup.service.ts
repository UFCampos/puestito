import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { commissionOrders, orderMessages, sessions, verifications, webhookEvents } from "../db/schema.js";
import { config } from "../config.js";
import { storage } from "./storage.service.js";
import { addSystemMessage, daysMs } from "./order.service.js";

/**
 * Limpieza diaria de archivos y registros que ya no hacen falta:
 *  - referencias que alguien subió al formulario pero nunca llegó a enviar el pedido;
 *  - archivos de pedidos rechazados, vencidos o cancelados, pasado el plazo de retención;
 *  - notificaciones de webhooks, verificaciones y sesiones viejas.
 * Los pedidos completados conservan sus archivos: el comprador puede volver a descargarlos.
 */
export interface CleanupReport {
  orphanReferences: number;
  purgedOrders: number;
  purgedFiles: number;
  oldRecords: number;
}

const ORPHAN_REFERENCE_AGE_MS = 24 * 3600_000;
const OLD_RECORD_AGE_MS = daysMs(90);

/** Keys de referencias que siguen en uso en pedidos de estos compradores */
async function referencesInUse(buyerIds: string[], exceptOrderId?: string): Promise<Set<string>> {
  if (buyerIds.length === 0) return new Set();
  const rows = await db
    .select({ refs: commissionOrders.referenceImages })
    .from(commissionOrders)
    .where(
      and(
        inArray(commissionOrders.buyerId, buyerIds),
        exceptOrderId ? ne(commissionOrders.id, exceptOrderId) : undefined
      )
    );
  return new Set(rows.flatMap((r) => r.refs));
}

async function removeOrphanReferences(now: Date): Promise<number> {
  let removed = 0;
  let batch: { key: string; buyerId: string }[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const inUse = await referencesInUse([...new Set(batch.map((b) => b.buyerId))]);
    for (const { key } of batch) {
      if (inUse.has(key)) continue;
      await storage.delete("private", key);
      removed += 1;
    }
    batch = [];
  };
  for await (const obj of storage.list("private", "refs/")) {
    if (now.getTime() - obj.lastModified.getTime() < ORPHAN_REFERENCE_AGE_MS) continue;
    // refs/{userId}/{uuid}.{ext}
    const buyerId = obj.key.split("/")[1];
    if (!buyerId || !/^[0-9a-f-]{36}$/i.test(buyerId)) continue;
    batch.push({ key: obj.key, buyerId });
    if (batch.length >= 100) await flush();
  }
  await flush();
  return removed;
}

async function purgeClosedOrderFiles(now: Date): Promise<{ orders: number; files: number }> {
  const cutoff = new Date(now.getTime() - daysMs(config.ORDER_FILES_RETENTION_DAYS));
  const orders = await db
    .select()
    .from(commissionOrders)
    .where(
      and(
        inArray(commissionOrders.status, ["REJECTED", "EXPIRED", "CANCELLED"]),
        isNull(commissionOrders.filesPurgedAt),
        lt(commissionOrders.statusChangedAt, cutoff)
      )
    )
    .limit(100);

  let files = 0;
  for (const order of orders) {
    const messages = await db
      .select({ attachments: orderMessages.attachments })
      .from(orderMessages)
      .where(eq(orderMessages.orderId, order.id));
    // Una misma referencia puede estar en otro pedido del comprador: esa no se toca
    const shared = await referencesInUse([order.buyerId], order.id);
    const keys = new Set<string>([
      ...order.referenceImages.filter((k) => !shared.has(k)),
      ...messages.flatMap((m) => m.attachments),
      ...[order.sketchWatermarkedKey, order.previewWatermarkedKey, order.finalHdPrivateKey].filter(
        (k): k is string => Boolean(k)
      )
    ]);
    for (const key of keys) await storage.delete("private", key);
    files += keys.size;

    await db.transaction(async (tx) => {
      await tx
        .update(commissionOrders)
        .set({
          referenceImages: [],
          sketchWatermarkedKey: null,
          previewWatermarkedKey: null,
          finalHdPrivateKey: null,
          finalHdFilename: null,
          filesPurgedAt: now
        })
        .where(eq(commissionOrders.id, order.id));
      await tx.update(orderMessages).set({ attachments: [] }).where(eq(orderMessages.orderId, order.id));
      if (keys.size > 0) {
        await addSystemMessage(
          tx,
          order.id,
          `🧹 Los archivos de este pedido se eliminaron: pasaron ${config.ORDER_FILES_RETENTION_DAYS} días desde su cierre.`
        );
      }
    });
  }
  return { orders: orders.length, files };
}

async function removeOldRecords(now: Date): Promise<number> {
  const old = new Date(now.getTime() - OLD_RECORD_AGE_MS);
  const week = new Date(now.getTime() - daysMs(7));
  const [events, verifs, sess] = [
    await db.delete(webhookEvents).where(lt(webhookEvents.createdAt, old)).returning({ id: webhookEvents.id }),
    await db.delete(verifications).where(lt(verifications.expiresAt, week)).returning({ id: verifications.id }),
    await db.delete(sessions).where(lt(sessions.expiresAt, week)).returning({ id: sessions.id })
  ];
  return events.length + verifs.length + sess.length;
}

export async function runCleanup(now: Date = new Date()): Promise<CleanupReport> {
  const orphanReferences = await removeOrphanReferences(now);
  const purged = await purgeClosedOrderFiles(now);
  const oldRecords = await removeOldRecords(now);
  return { orphanReferences, purgedOrders: purged.orders, purgedFiles: purged.files, oldRecords };
}
