import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import { loadOrderFor } from "../lib/order-access.js";
import { openDisputeOf } from "../services/payments.service.js";
import {
  acceptRefundProposal,
  artistRefund,
  closeUnpaidOrder,
  openUserDispute,
  rejectRefundProposal,
  resumeDisputedOrder
} from "../services/resolution.service.js";

const disputeReason = z.enum([
  "ARTIST_UNRESPONSIVE",
  "BUYER_UNRESPONSIVE",
  "LATE_DELIVERY",
  "NOT_AS_AGREED",
  "WANTS_TO_CANCEL",
  "PAYMENT_PROBLEM",
  "ABUSIVE_BEHAVIOR",
  "OTHER"
]);

/**
 * Salidas para un pedido que ya tiene pagos y no puede seguir el camino normal
 * (mismas URLs que el resto de la sala: /api/orders/:id/...).
 */
export async function orderResolutionRoutes(fastify: FastifyInstance) {
  // POST /api/orders/:id/dispute — cualquiera de las partes abre un reclamo; el pedido queda en pausa
  fastify.post("/:id/dispute", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer, isArtist } = await loadOrderFor(request, user);
    if (!isBuyer && !isArtist) throw new HttpError(403, "Solo los participantes del pedido pueden abrir un reclamo");
    const body = parseBody(
      z.object({
        reason: disputeReason,
        description: z
          .string()
          .trim()
          .min(20, "Contanos qué pasó con un poco más de detalle (mínimo 20 caracteres)")
          .max(3000)
      }),
      request.body
    );
    const { order: updated, dispute } = await openUserDispute(order, user, isBuyer ? "BUYER" : "ARTIST", body.reason, body.description);
    return { ok: true, status: updated.status, disputeId: dispute.id };
  });

  // POST /api/orders/:id/dispute/withdraw — quien abrió el reclamo lo retira y el pedido sigue
  fastify.post("/:id/dispute/withdraw", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer, isArtist } = await loadOrderFor(request, user);
    if (!isBuyer && !isArtist) throw new HttpError(403, "No autorizado");
    const dispute = await openDisputeOf(order.id);
    if (!dispute) throw new HttpError(409, "El pedido no tiene un reclamo abierto");
    if (dispute.openedById !== user.id) {
      throw new HttpError(403, "Solo quien abrió el reclamo puede retirarlo. Si ya lo resolvieron, pedile que lo retire.");
    }
    const updated = await resumeDisputedOrder(order, "WITHDRAWN", {
      message: `🤝 ${isBuyer ? "El comprador" : "El artista"} retiró el reclamo: el pedido continúa.`,
      resolvedById: user.id
    });
    return { ok: true, status: updated.status };
  });

  // POST /api/orders/:id/refund — el artista cancela reembolsando.
  //   Sin `paymentIds` (o con todos): reembolso total, inmediato.
  //   Con una parte: propuesta dentro del reclamo, que el comprador acepta o rechaza.
  fastify.post("/:id/refund", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const { order, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede emitir un reembolso: el dinero está en su cuenta de Mercado Pago");
    const body = parseBody(z.object({ paymentIds: z.array(z.string().uuid()).max(10).optional() }), request.body);
    const result = await artistRefund(order, body.paymentIds);
    return { ok: true, status: result.order.status, proposed: result.proposed };
  });

  fastify.post("/:id/dispute/accept-proposal", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede aceptar la propuesta");
    if (order.status !== "DISPUTED") throw new HttpError(409, "El pedido no tiene un reclamo abierto");
    const updated = await acceptRefundProposal(order);
    return { ok: true, status: updated.status };
  });

  fastify.post("/:id/dispute/reject-proposal", async (request) => {
    const user = await requireUser(request);
    const { order, isBuyer } = await loadOrderFor(request, user);
    if (!isBuyer) throw new HttpError(403, "Solo el comprador puede rechazar la propuesta");
    await rejectRefundProposal(order);
    return { ok: true, status: order.status };
  });

  // POST /api/orders/:id/close-unpaid — el artista cierra un pedido cuyo pago intermedio venció
  fastify.post("/:id/close-unpaid", async (request) => {
    const user = await requireUser(request);
    const { order, isArtist } = await loadOrderFor(request, user);
    if (!isArtist) throw new HttpError(403, "Solo el artista puede cerrar el pedido por falta de pago");
    const updated = await closeUnpaidOrder(order);
    return { ok: true, status: updated.status };
  });
}
