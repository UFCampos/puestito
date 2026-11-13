import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { artistProfiles, commissionOrders, commissionServices, portfolioItems, reports, reviews } from "../db/schema.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import { notifyDiscord } from "../services/notification.service.js";

export const REPORT_REASON_LABEL: Record<(typeof reports.$inferSelect)["reason"], string> = {
  ILLEGAL_CONTENT: "Contenido ilegal",
  MINOR_SAFETY: "Sexualización de menores",
  AI_GENERATED: "Arte generado con IA",
  STOLEN_ART: "Arte robado o plagio",
  SCAM_OR_FRAUD: "Estafa o fraude",
  HARASSMENT: "Acoso o maltrato",
  WRONG_RATING: "Clasificación de contenido incorrecta",
  SPAM: "Spam",
  OTHER: "Otro motivo"
};

/** Motivos que moderación tiene que ver cuanto antes */
const URGENT_REASONS = new Set(["ILLEGAL_CONTENT", "MINOR_SAFETY"]);

/**
 * POST /api/reports — denunciar un puestito, una obra, una comisión, una reseña o un pedido.
 * Requiere sesión (evita el abuso anónimo) y entra a la cola de moderación de /admin.
 */
export async function reportRoutes(fastify: FastifyInstance) {
  fastify.post("/", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const body = parseBody(
      z.object({
        targetType: z.enum(["ARTIST", "PORTFOLIO_ITEM", "SERVICE", "ORDER", "REVIEW"]),
        targetId: z.string().uuid(),
        reason: z.enum(["ILLEGAL_CONTENT", "MINOR_SAFETY", "AI_GENERATED", "STOLEN_ART", "SCAM_OR_FRAUD", "HARASSMENT", "WRONG_RATING", "SPAM", "OTHER"]),
        details: z.string().trim().max(2000).default("")
      }),
      request.body
    );

    // El objetivo tiene que existir; de paso sabemos a qué puestito corresponde
    let artistId: string | null = null;
    if (body.targetType === "ARTIST") {
      const [row] = await db.select({ id: artistProfiles.id, userId: artistProfiles.userId }).from(artistProfiles).where(eq(artistProfiles.id, body.targetId)).limit(1);
      if (!row) throw new HttpError(404, "No encontramos lo que querés denunciar");
      if (row.userId === user.id) throw new HttpError(400, "No podés denunciar tu propio puestito");
      artistId = row.id;
    } else if (body.targetType === "PORTFOLIO_ITEM") {
      const [row] = await db.select({ artistId: portfolioItems.artistId }).from(portfolioItems).where(eq(portfolioItems.id, body.targetId)).limit(1);
      if (!row) throw new HttpError(404, "No encontramos lo que querés denunciar");
      artistId = row.artistId;
    } else if (body.targetType === "SERVICE") {
      const [row] = await db.select({ artistId: commissionServices.artistId }).from(commissionServices).where(eq(commissionServices.id, body.targetId)).limit(1);
      if (!row) throw new HttpError(404, "No encontramos lo que querés denunciar");
      artistId = row.artistId;
    } else if (body.targetType === "REVIEW") {
      const [row] = await db.select({ artistId: reviews.artistId }).from(reviews).where(eq(reviews.id, body.targetId)).limit(1);
      if (!row) throw new HttpError(404, "No encontramos lo que querés denunciar");
      artistId = row.artistId;
    } else {
      // Un pedido solo lo puede denunciar quien participa en él
      const [row] = await db
        .select({ artistId: commissionOrders.artistId, buyerId: commissionOrders.buyerId, artistUserId: artistProfiles.userId })
        .from(commissionOrders)
        .innerJoin(artistProfiles, eq(commissionOrders.artistId, artistProfiles.id))
        .where(eq(commissionOrders.id, body.targetId))
        .limit(1);
      if (!row || (row.buyerId !== user.id && row.artistUserId !== user.id)) {
        throw new HttpError(404, "No encontramos lo que querés denunciar");
      }
      artistId = row.artistId;
    }

    // Una denuncia abierta por persona y objetivo: repetirla no suma
    const [existing] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, user.id),
          eq(reports.targetType, body.targetType),
          eq(reports.targetId, body.targetId),
          eq(reports.status, "OPEN")
        )
      )
      .limit(1);
    if (existing) return { ok: true, id: existing.id, duplicate: true };

    const [created] = await db
      .insert(reports)
      .values({ reporterId: user.id, targetType: body.targetType, targetId: body.targetId, artistId, reason: body.reason, details: body.details })
      .returning({ id: reports.id });
    void notifyDiscord(
      `${URGENT_REASONS.has(body.reason) ? "🚨 URGENTE — " : "🚩 "}Denuncia de @${user.username}: ${REPORT_REASON_LABEL[body.reason]} (${body.targetType})${body.details ? ` — ${body.details.slice(0, 300)}` : ""}`
    );
    return { ok: true, id: created!.id, duplicate: false };
  });
}
