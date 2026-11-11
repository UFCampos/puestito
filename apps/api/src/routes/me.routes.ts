import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { artistProfiles, users } from "../db/schema.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import { storage, newKey } from "../services/storage.service.js";
import { WatermarkService } from "../services/watermark.service.js";
import { notifyDiscord } from "../services/notification.service.js";
import { LIMITS, LIMITS_MB } from "../lib/limits.js";

const DEFAULT_TOS =
  "1. La seña no es reembolsable una vez entregado el boceto.\n2. Prohibido usar mi arte para entrenar modelos de IA.\n3. Uso personal únicamente (consultar por licencia comercial).";

export async function meRoutes(fastify: FastifyInstance) {
  // GET /api/me — usuario de la sesión + perfil de artista
  fastify.get("/", async (request) => {
    const user = await requireUser(request);
    const [artistProfile] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
    return { user, artistProfile: artistProfile ?? null };
  });

  // PUT /api/me/preferences — nombre visible y filtro +18
  fastify.put("/preferences", async (request) => {
    const user = await requireUser(request);
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        showNsfw: z.boolean().optional(),
        confirmAdult: z.boolean().optional()
      }),
      request.body
    );
    if (body.showNsfw === true && body.confirmAdult !== true) {
      throw new HttpError(400, "Para ver contenido +18 tenés que confirmar que sos mayor de edad");
    }
    await db
      .update(users)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.showNsfw !== undefined ? { showNsfw: body.showNsfw } : {})
      })
      .where(eq(users.id, user.id));
    return { ok: true };
  });

  // POST /api/me/artist-profile — abrir un puestito (convierte la cuenta en ARTIST)
  fastify.post("/artist-profile", async (request) => {
    const user = await requireUser(request);
    const body = parseBody(z.object({ acceptHumanArtPledge: z.literal(true) }), request.body);
    void body;
    const [existing] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
    if (existing) return { artistProfile: existing };

    const profile = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(artistProfiles)
        .values({
          userId: user.id,
          bio: "¡Hola! Bienvenido/a a mi puestito de arte ✨",
          commissionStatus: "CLOSED",
          defaultWatermarkMode: "AUTO_TEXT",
          termsOfService: DEFAULT_TOS,
          // La insignia "humano verificado" la otorga moderación, no el propio artista.
          isVerifiedHuman: false
        })
        .returning();
      if (user.role !== "ADMIN") await tx.update(users).set({ role: "ARTIST" }).where(eq(users.id, user.id));
      return created!;
    });
    void notifyDiscord(`🎨 Nuevo puestito: @${user.username} (${user.name})`);
    return { artistProfile: profile };
  });

  // POST /api/me/images?kind=avatar|banner — sube avatar o banner al bucket público
  fastify.post("/images", async (request) => {
    const user = await requireUser(request);
    const kind = (request.query as { kind?: string }).kind;
    if (kind !== "avatar" && kind !== "banner") throw new HttpError(400, "kind debe ser avatar o banner");

    const file = await request.file({ limits: { fileSize: LIMITS.avatarBytes } });
    if (!file) throw new HttpError(400, "Archivo requerido");
    const buffer = await file.toBuffer().catch(() => null);
    if (!buffer || file.file.truncated) throw new HttpError(413, `La imagen supera los ${LIMITS_MB.avatar} MB`);
    await WatermarkService.assertImage(buffer).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    const optimized = await WatermarkService.optimize(buffer, kind === "avatar" ? 512 : 1800);
    const key = newKey(`${kind}s/${user.id}`, "webp");
    await storage.put("public", key, optimized, "image/webp");
    const url = storage.publicUrl(key);

    if (kind === "avatar") {
      await db.update(users).set({ image: url }).where(eq(users.id, user.id));
    } else {
      const [profile] = await db
        .update(artistProfiles)
        .set({ bannerUrl: url })
        .where(eq(artistProfiles.userId, user.id))
        .returning({ id: artistProfiles.id });
      if (!profile) throw new HttpError(403, "Solo los artistas tienen banner");
    }
    return { url };
  });
}
