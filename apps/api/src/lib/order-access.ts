import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { artistProfiles, commissionOrders } from "../db/schema.js";
import type { Order } from "../services/order.service.js";
import { HttpError, isUuid, type SessionUser } from "./http.js";

/** Carga el pedido y determina el rol del usuario; 404 si no participa (no revela existencia) */
export async function loadOrderFor(request: FastifyRequest, user: SessionUser) {
  const { id } = request.params as { id: string };
  if (!isUuid(id)) throw new HttpError(404, "Pedido no encontrado");
  const [row] = await db
    .select({ order: commissionOrders, artistUserId: artistProfiles.userId, artistProfile: artistProfiles })
    .from(commissionOrders)
    .innerJoin(artistProfiles, eq(commissionOrders.artistId, artistProfiles.id))
    .where(eq(commissionOrders.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "Pedido no encontrado");
  const isBuyer = row.order.buyerId === user.id;
  const isArtist = row.artistUserId === user.id;
  const isAdmin = user.role === "ADMIN" && !user.suspended;
  if (!isBuyer && !isArtist && !isAdmin) throw new HttpError(404, "Pedido no encontrado");
  return { order: row.order, artistProfile: row.artistProfile, isBuyer, isArtist, isAdmin };
}

export function assertStatus(order: Order, ...allowed: Order["status"][]) {
  if (!allowed.includes(order.status)) {
    throw new HttpError(
      409,
      order.status === "DISPUTED"
        ? "El pedido está en pausa por un reclamo abierto. Resolvelo para poder continuar."
        : "Esta acción no está disponible en el estado actual del pedido"
    );
  }
}
