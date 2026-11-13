import type { FastifyInstance } from "fastify";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/index.js";
import { accounts, artistProfiles, commissionOrders, orderMessages, users } from "../db/schema.js";
import { config } from "../config.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import { storage, newKey } from "../services/storage.service.js";
import { WatermarkService } from "../services/watermark.service.js";
import { html, notifyDiscord, sendEmail } from "../services/notification.service.js";
import { deleteAccount, exportAccountData } from "../services/account.service.js";
import { ARTIST_ACTION_STATUSES, BUYER_ACTION_STATUSES } from "../services/order.service.js";
import { LIMITS, LIMITS_MB } from "../lib/limits.js";

const DEFAULT_TOS =
  "1. La seña no es reembolsable una vez entregado el boceto.\n2. Prohibido usar mi arte para entrenar modelos de IA.\n3. Uso personal únicamente (consultar por licencia comercial).";

/** Pedidos que piden la atención del usuario: le toca actuar, hay un reclamo o tiene mensajes sin leer */
async function attentionCount(userId: string, artistProfileId: string | null): Promise<number> {
  const unread = (seenAt: AnyPgColumn) => sql`exists (
    select 1 from ${orderMessages} m
    where m.order_id = ${commissionOrders.id}
      and (m.sender_id is null or m.sender_id <> ${userId})
      and m.created_at > coalesce(${seenAt}, 'epoch'::timestamptz)
  )`;
  const asBuyer = and(
    eq(commissionOrders.buyerId, userId),
    or(inArray(commissionOrders.status, [...BUYER_ACTION_STATUSES, "DISPUTED"]), unread(commissionOrders.buyerSeenAt))
  );
  const asArtist = artistProfileId
    ? and(
        eq(commissionOrders.artistId, artistProfileId),
        or(inArray(commissionOrders.status, [...ARTIST_ACTION_STATUSES, "DISPUTED"]), unread(commissionOrders.artistSeenAt))
      )
    : undefined;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(commissionOrders)
    .where(asArtist ? or(asBuyer, asArtist) : asBuyer);
  return row?.n ?? 0;
}

export async function meRoutes(fastify: FastifyInstance) {
  // GET /api/me — usuario de la sesión + perfil de artista
  fastify.get("/", async (request) => {
    const user = await requireUser(request);

    // Alta del equipo sin tocar la base: los emails de ADMIN_EMAILS pasan a ADMIN una vez verificados
    if (user.role !== "ADMIN" && user.emailVerified && config.ADMIN_EMAIL_LIST.includes(user.email.toLowerCase())) {
      await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, user.id));
      user.role = "ADMIN";
      void notifyDiscord(`🛡️ @${user.username} ahora es ADMIN (está en ADMIN_EMAILS)`);
    }

    const [artistProfile] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
    const [account] = await db
      .select({ suspensionReason: users.suspensionReason, termsAcceptedAt: users.termsAcceptedAt, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return {
      user: { ...user, suspensionReason: user.suspended ? account?.suspensionReason ?? null : null },
      artistProfile: artistProfile ?? null,
      // Para el indicador de "Mis pedidos" en la barra de navegación
      attention: await attentionCount(user.id, artistProfile?.id ?? null),
      account: { termsAcceptedAt: account?.termsAcceptedAt ?? null, createdAt: account?.createdAt ?? null }
    };
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
        ...(body.showNsfw !== undefined ? { showNsfw: body.showNsfw } : {}),
        // Queda registrado cuándo declaró ser mayor de edad
        ...(body.showNsfw === true ? { adultConfirmedAt: new Date() } : {})
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

    let previous: string | null;
    if (kind === "avatar") {
      previous = user.image;
      await db.update(users).set({ image: url }).where(eq(users.id, user.id));
    } else {
      const [before] = await db.select({ bannerUrl: artistProfiles.bannerUrl }).from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
      if (!before) {
        await storage.delete("public", key);
        throw new HttpError(403, "Solo los artistas tienen banner");
      }
      previous = before.bannerUrl;
      await db.update(artistProfiles).set({ bannerUrl: url }).where(eq(artistProfiles.userId, user.id));
    }
    // La imagen anterior deja de usarse: no la dejamos huérfana en el bucket
    const previousKey = storage.keyFromPublicUrl(previous);
    if (previousKey && previousKey !== key) await storage.delete("public", previousKey).catch(() => {});
    return { url };
  });

  // ───────────────────────────────────────────────────────────
  // Datos personales (Ley 25.326): acceso y supresión. Funcionan aunque la cuenta esté suspendida.
  // ───────────────────────────────────────────────────────────
  // GET /api/me/export — descarga todo lo que guardamos sobre la cuenta
  fastify.get("/export", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const user = await requireUser(request, { allowSuspended: true });
    const data = await exportAccountData(user);
    return reply
      .header("Content-Disposition", `attachment; filename="tupuestito-mis-datos-${user.username}.json"`)
      .header("Cache-Control", "private, no-store")
      .send(data);
  });

  // GET /api/me/security — cómo ingresa la cuenta (para saber si tiene contraseña que cambiar)
  fastify.get("/security", async (request) => {
    const user = await requireUser(request, { allowSuspended: true });
    const logins = await db.select({ providerId: accounts.providerId }).from(accounts).where(eq(accounts.userId, user.id));
    return { hasPassword: logins.some((l) => l.providerId === "credential"), providers: logins.map((l) => l.providerId) };
  });

  // DELETE /api/me — elimina la cuenta (pide escribir el @usuario para confirmar)
  fastify.delete("/", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request) => {
    const user = await requireUser(request, { allowSuspended: true });
    const body = parseBody(z.object({ confirmUsername: z.string().trim().toLowerCase() }), request.body);
    if (body.confirmUsername.replace(/^@/, "") !== user.username) {
      throw new HttpError(400, "Para confirmar, escribí tu nombre de usuario tal cual figura en tu cuenta");
    }
    const { mode } = await deleteAccount(user);
    void sendEmail({
      to: user.email,
      subject: "Tu cuenta de TuPuestito fue eliminada",
      title: "Cuenta eliminada",
      html: `<p>Hola ${html.escape(user.name)},</p><p>Eliminamos tu cuenta <strong>@${html.escape(user.username)}</strong> como pediste.${
        mode === "anonymized"
          ? " Los pedidos en los que participaste se conservan sin tus datos personales, porque son un registro que también le pertenece a la otra parte."
          : ""
      }</p><p>Si no fuiste vos, escribinos cuanto antes a ${html.escape(config.SUPPORT_EMAIL)}.</p>`
    });
    void notifyDiscord(`🗑️ Cuenta eliminada: @${user.username} (${mode === "deleted" ? "borrado total" : "anonimizada"})`);
    return { ok: true, mode };
  });
}
