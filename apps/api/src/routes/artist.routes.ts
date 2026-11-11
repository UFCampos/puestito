import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  artistProfiles,
  commissionAddons,
  commissionServices,
  portfolioItems,
  reviews,
  users
} from "../db/schema.js";
import { HttpError, getSessionUser, parseBody, requireArtist, requireUser } from "../lib/http.js";
import { loadTags, setPortfolioTags, setServiceTags } from "../lib/tags.js";
import { WatermarkService } from "../services/watermark.service.js";
import { newKey, storage } from "../services/storage.service.js";
import { SLOT_STATUSES } from "../services/order.service.js";
import { commissionOrders } from "../db/schema.js";
import { config } from "../config.js";

const ratingEnum = z.enum(["SFW", "SUGGESTIVE", "NSFW"]);
const watermarkEnum = z.enum(["MANUAL", "AUTO_TEXT", "AUTO_AVATAR"]);
const planEnum = z.enum(["FULL_100", "SPLIT_ON_SKETCH", "SPLIT_ON_FINAL_PREVIEW"]);

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => u.startsWith("https://"), "Debe ser un link https://");

const serviceSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(4000),
  priceArs: z.number().int().min(100).max(100_000_000),
  priceUsd: z.number().min(0).max(1_000_000).nullable().optional(),
  paymentPlan: planEnum,
  turnaroundDays: z.number().int().min(1).max(365),
  maxSlots: z.number().int().min(1).max(100),
  revisionsIncluded: z.number().int().min(0).max(20),
  rating: ratingEnum,
  tags: z.array(z.string().max(40)).max(15).default([]),
  addons: z
    .array(z.object({ name: z.string().trim().min(1).max(80), priceArs: z.number().int().min(0).max(100_000_000) }))
    .max(10)
    .default([])
});

/** Oculta la imagen de items +18 a quien no activó el filtro */
function visibleImage<T extends { rating: string; imageUrl: string }>(item: T, showNsfw: boolean) {
  const hidden = item.rating === "NSFW" && !showNsfw;
  return { ...item, imageUrl: hidden ? null : item.imageUrl, hidden };
}

async function servicesWithExtras(serviceIds: string[]) {
  const [tagMap, addons, activeCounts] = await Promise.all([
    loadTags(db, "service", serviceIds),
    serviceIds.length
      ? db
          .select()
          .from(commissionAddons)
          .where(and(inArray(commissionAddons.serviceId, serviceIds), eq(commissionAddons.isActive, true)))
      : Promise.resolve([]),
    serviceIds.length
      ? db
          .select({ serviceId: commissionOrders.serviceId, n: sql<number>`count(*)::int` })
          .from(commissionOrders)
          .where(and(inArray(commissionOrders.serviceId, serviceIds), inArray(commissionOrders.status, SLOT_STATUSES)))
          .groupBy(commissionOrders.serviceId)
      : Promise.resolve([])
  ]);
  return { tagMap, addons, activeCounts: new Map(activeCounts.map((r) => [r.serviceId, r.n])) };
}

export async function artistRoutes(fastify: FastifyInstance) {
  // ───────────────────────────────────────────────────────────
  // GET /api/artists/explore — Home con buscador y filtros (Plan Sprint 3)
  // ───────────────────────────────────────────────────────────
  fastify.get("/explore", async (request) => {
    const viewer = await getSessionUser(request);
    const showNsfw = Boolean(viewer?.showNsfw);
    const query = request.query as { q?: string; status?: string; rating?: string; maxPrice?: string; tag?: string };
    const q = query.q?.trim().slice(0, 80) ?? "";
    const tag = query.tag?.trim().toLowerCase() ?? "";
    const maxPrice = query.maxPrice ? Number(query.maxPrice) : null;
    const allowedRatings = new Set(
      query.rating === "SFW_ONLY" ? ["SFW"] : showNsfw ? ["SFW", "SUGGESTIVE", "NSFW"] : ["SFW", "SUGGESTIVE"]
    );

    const conditions = [];
    if (query.status && ["OPEN", "WAITLIST", "CLOSED"].includes(query.status)) {
      conditions.push(eq(artistProfiles.commissionStatus, query.status as "OPEN" | "WAITLIST" | "CLOSED"));
    }

    const artists = await db
      .select({
        id: artistProfiles.id,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        commissionStatus: artistProfiles.commissionStatus,
        isVerifiedHuman: artistProfiles.isVerifiedHuman,
        userId: users.id,
        username: users.username,
        displayName: users.name,
        avatarUrl: users.image
      })
      .from(artistProfiles)
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(artistProfiles.isVerifiedHuman), desc(artistProfiles.createdAt))
      .limit(200);

    const artistIds = artists.map((a) => a.id);
    if (artistIds.length === 0) return { artists: [] };

    const [services, portfolio, ratingRows] = await Promise.all([
      db
        .select()
        .from(commissionServices)
        .where(and(inArray(commissionServices.artistId, artistIds), eq(commissionServices.isActive, true))),
      db
        .select()
        .from(portfolioItems)
        .where(inArray(portfolioItems.artistId, artistIds))
        .orderBy(desc(portfolioItems.createdAt)),
      db
        .select({
          artistId: reviews.artistId,
          avg: sql<string>`avg(${reviews.rating})`,
          n: sql<number>`count(*)::int`
        })
        .from(reviews)
        .where(inArray(reviews.artistId, artistIds))
        .groupBy(reviews.artistId)
    ]);

    const [serviceTags, portfolioTags] = await Promise.all([
      loadTags(db, "service", services.map((s) => s.id)),
      loadTags(db, "portfolio", portfolio.map((p) => p.id))
    ]);
    const ratingMap = new Map(ratingRows.map((r) => [r.artistId, r]));
    const qLower = q.toLowerCase();

    const result = artists
      .map((artist) => {
        let svc = services
          .filter((s) => s.artistId === artist.id && allowedRatings.has(s.rating))
          .map((s) => ({ ...s, tags: serviceTags.get(s.id) ?? [] }));
        if (maxPrice && !Number.isNaN(maxPrice)) svc = svc.filter((s) => s.priceArs <= maxPrice);
        const port = portfolio
          .filter((p) => p.artistId === artist.id && allowedRatings.has(p.rating))
          .map((p) => ({ ...visibleImage(p, showNsfw), tags: portfolioTags.get(p.id) ?? [] }));
        const r = ratingMap.get(artist.id);
        return {
          ...artist,
          avgRating: r ? Number(Number(r.avg).toFixed(1)) : null,
          reviewCount: r?.n ?? 0,
          services: svc,
          portfolio: port.slice(0, 6),
          _allPortfolio: port
        };
      })
      .filter((a) => {
        if (maxPrice && a.services.length === 0) return false;
        if (tag) {
          const has = (list: string[]) => list.some((t) => t.toLowerCase().includes(tag));
          if (!a.services.some((s) => has(s.tags)) && !a._allPortfolio.some((p) => has(p.tags))) return false;
        }
        if (qLower) {
          const inName =
            a.displayName.toLowerCase().includes(qLower) ||
            (a.username ?? "").includes(qLower) ||
            (a.bio ?? "").toLowerCase().includes(qLower);
          const inServices = a.services.some(
            (s) =>
              s.title.toLowerCase().includes(qLower) ||
              s.description.toLowerCase().includes(qLower) ||
              s.tags.some((t) => t.toLowerCase().includes(qLower))
          );
          const inPortfolio = a._allPortfolio.some(
            (p) => p.title.toLowerCase().includes(qLower) || p.tags.some((t) => t.toLowerCase().includes(qLower))
          );
          return inName || inServices || inPortfolio;
        }
        return true;
      })
      .map(({ _allPortfolio, ...a }) => a);

    return { artists: result };
  });

  // ───────────────────────────────────────────────────────────
  // GET /api/artists/:username — Perfil-Tienda público
  // ───────────────────────────────────────────────────────────
  fastify.get("/:username", async (request) => {
    const { username } = request.params as { username: string };
    const viewer = await getSessionUser(request);
    const [row] = await db
      .select({ user: users, profile: artistProfiles })
      .from(users)
      .innerJoin(artistProfiles, eq(artistProfiles.userId, users.id))
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);
    if (!row) throw new HttpError(404, "Artista no encontrado");
    const { user, profile } = row;
    const isOwner = viewer?.id === user.id;
    const showNsfw = Boolean(viewer?.showNsfw) || isOwner;

    const [portfolio, services, artistReviews] = await Promise.all([
      db.select().from(portfolioItems).where(eq(portfolioItems.artistId, profile.id)).orderBy(desc(portfolioItems.createdAt)),
      db
        .select()
        .from(commissionServices)
        .where(and(eq(commissionServices.artistId, profile.id), eq(commissionServices.isActive, true)))
        .orderBy(desc(commissionServices.createdAt)),
      db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          comment: reviews.comment,
          createdAt: reviews.createdAt,
          buyerName: users.name,
          buyerUsername: users.username,
          buyerAvatar: users.image
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.buyerId, users.id))
        .where(eq(reviews.artistId, profile.id))
        .orderBy(desc(reviews.createdAt))
        .limit(50)
    ]);

    const portfolioTags = await loadTags(db, "portfolio", portfolio.map((p) => p.id));
    const extras = await servicesWithExtras(services.map((s) => s.id));

    return {
      artist: {
        id: profile.id,
        userId: user.id,
        username: user.username,
        displayName: user.name,
        avatarUrl: user.image,
        bio: profile.bio,
        bannerUrl: profile.bannerUrl,
        commissionStatus: profile.commissionStatus,
        termsOfService: profile.termsOfService,
        isVerifiedHuman: profile.isVerifiedHuman,
        socialLinks: profile.socialLinks ?? {},
        defaultWatermarkMode: profile.defaultWatermarkMode,
        watermarkCustomText: profile.watermarkCustomText
      },
      viewerCanSeeNsfw: showNsfw,
      portfolio: portfolio.map((p) => ({ ...visibleImage(p, showNsfw), tags: portfolioTags.get(p.id) ?? [] })),
      services: services.map((s) => {
        const active = extras.activeCounts.get(s.id) ?? 0;
        return {
          ...s,
          priceUsd: s.priceUsd === null ? null : Number(s.priceUsd),
          tags: extras.tagMap.get(s.id) ?? [],
          addons: extras.addons
            .filter((a) => a.serviceId === s.id)
            .map((a) => ({ id: a.id, name: a.name, priceArs: a.priceArs })),
          slotsTaken: active,
          slotsAvailable: Math.max(0, s.maxSlots - active)
        };
      }),
      reviews: artistReviews,
      avgRating: artistReviews.length
        ? Number((artistReviews.reduce((acc, r) => acc + r.rating, 0) / artistReviews.length).toFixed(1))
        : null
    };
  });

  // ───────────────────────────────────────────────────────────
  // PUT /api/artists/profile
  // ───────────────────────────────────────────────────────────
  fastify.put("/profile", async (request) => {
    const { user, profile } = await requireArtist(request);
    const body = parseBody(
      z.object({
        displayName: z.string().trim().min(1).max(60).optional(),
        bio: z.string().max(2000).optional(),
        commissionStatus: z.enum(["OPEN", "WAITLIST", "CLOSED"]).optional(),
        defaultWatermarkMode: watermarkEnum.optional(),
        watermarkCustomText: z.string().trim().max(80).nullable().optional(),
        termsOfService: z.string().max(10000).optional(),
        socialLinks: z.record(z.enum(["twitter", "instagram", "pixiv", "vgen", "tiktok", "youtube", "web"]), z.union([httpsUrl, z.literal("")])).optional()
      }),
      request.body
    );

    await db.transaction(async (tx) => {
      if (body.displayName) await tx.update(users).set({ name: body.displayName }).where(eq(users.id, user.id));
      await tx
        .update(artistProfiles)
        .set({
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.commissionStatus ? { commissionStatus: body.commissionStatus } : {}),
          ...(body.defaultWatermarkMode ? { defaultWatermarkMode: body.defaultWatermarkMode } : {}),
          ...(body.watermarkCustomText !== undefined ? { watermarkCustomText: body.watermarkCustomText || null } : {}),
          ...(body.termsOfService !== undefined ? { termsOfService: body.termsOfService } : {}),
          ...(body.socialLinks
            ? { socialLinks: Object.fromEntries(Object.entries(body.socialLinks).filter(([, v]) => v)) }
            : {})
        })
        .where(eq(artistProfiles.id, profile.id));
    });
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/artists/portfolio — multipart: file + title/description/rating/tags/watermarkMode
  // ───────────────────────────────────────────────────────────
  fastify.post("/portfolio", async (request) => {
    const { user, profile } = await requireArtist(request);
    const data = await request.file({ limits: { fileSize: 25 * 1024 * 1024 } });
    if (!data) throw new HttpError(400, "Archivo requerido");
    const buffer = await data.toBuffer();
    if (data.file.truncated) throw new HttpError(413, "La imagen supera los 25 MB");
    await WatermarkService.assertImage(buffer).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });

    const field = (name: string) => {
      const f = (data.fields as Record<string, { value?: unknown } | undefined>)[name];
      return typeof f?.value === "string" ? f.value : undefined;
    };
    const meta = parseBody(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().max(2000).optional(),
        rating: ratingEnum.default("SFW"),
        tags: z.string().max(600).optional(),
        watermarkMode: watermarkEnum.optional()
      }),
      {
        title: field("title"),
        description: field("description"),
        rating: field("rating") || undefined,
        tags: field("tags"),
        watermarkMode: field("watermarkMode") || undefined
      }
    );

    const mode = meta.watermarkMode ?? profile.defaultWatermarkMode;
    const avatar = mode === "AUTO_AVATAR" ? await loadAvatar(user.image) : null;
    const processed = await WatermarkService.apply(buffer, {
      mode,
      username: user.username,
      customText: profile.watermarkCustomText,
      avatar
    });
    const key = newKey(`portfolio/${profile.id}`, "webp");
    await storage.put("public", key, processed, "image/webp");
    const imageUrl = storage.publicUrl(key);

    const item = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(portfolioItems)
        .values({
          artistId: profile.id,
          title: meta.title,
          description: meta.description ?? "",
          imageUrl,
          imageKey: key,
          rating: meta.rating
        })
        .returning();
      await setPortfolioTags(tx, created!.id, (meta.tags ?? "").split(","));
      return created!;
    });
    return { id: item.id, imageUrl };
  });

  // DELETE /api/artists/portfolio/:itemId
  fastify.delete("/portfolio/:itemId", async (request) => {
    const { profile } = await requireArtist(request);
    const { itemId } = request.params as { itemId: string };
    const [deleted] = await db
      .delete(portfolioItems)
      .where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.artistId, profile.id)))
      .returning();
    if (!deleted) throw new HttpError(404, "Obra no encontrada");
    if (deleted.imageKey) await storage.delete("public", deleted.imageKey);
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // Servicios de comisión (con addons y tags)
  // ───────────────────────────────────────────────────────────
  fastify.post("/services", async (request) => {
    const { profile } = await requireArtist(request);
    const body = parseBody(serviceSchema, request.body);
    const service = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(commissionServices)
        .values({
          artistId: profile.id,
          title: body.title,
          description: body.description,
          priceArs: body.priceArs,
          priceUsd: body.priceUsd != null ? body.priceUsd.toFixed(2) : null,
          paymentPlan: body.paymentPlan,
          turnaroundDays: body.turnaroundDays,
          maxSlots: body.maxSlots,
          revisionsIncluded: body.revisionsIncluded,
          rating: body.rating
        })
        .returning();
      if (body.addons.length) {
        await tx.insert(commissionAddons).values(body.addons.map((a) => ({ ...a, serviceId: created!.id })));
      }
      await setServiceTags(tx, created!.id, body.tags);
      return created!;
    });
    return { id: service.id, ok: true };
  });

  fastify.put("/services/:serviceId", async (request) => {
    const { profile } = await requireArtist(request);
    const { serviceId } = request.params as { serviceId: string };
    const body = parseBody(serviceSchema, request.body);
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(commissionServices)
        .set({
          title: body.title,
          description: body.description,
          priceArs: body.priceArs,
          priceUsd: body.priceUsd != null ? body.priceUsd.toFixed(2) : null,
          paymentPlan: body.paymentPlan,
          turnaroundDays: body.turnaroundDays,
          maxSlots: body.maxSlots,
          revisionsIncluded: body.revisionsIncluded,
          rating: body.rating
        })
        .where(and(eq(commissionServices.id, serviceId), eq(commissionServices.artistId, profile.id)))
        .returning({ id: commissionServices.id });
      if (!updated) throw new HttpError(404, "Servicio no encontrado");
      // Los pedidos guardan snapshot de los addons: desactivar los viejos no afecta pedidos existentes.
      await tx.update(commissionAddons).set({ isActive: false }).where(eq(commissionAddons.serviceId, serviceId));
      if (body.addons.length) {
        await tx.insert(commissionAddons).values(body.addons.map((a) => ({ ...a, serviceId })));
      }
      await setServiceTags(tx, serviceId, body.tags);
    });
    return { ok: true };
  });

  fastify.delete("/services/:serviceId", async (request) => {
    const { profile } = await requireArtist(request);
    const { serviceId } = request.params as { serviceId: string };
    const [updated] = await db
      .update(commissionServices)
      .set({ isActive: false })
      .where(and(eq(commissionServices.id, serviceId), eq(commissionServices.artistId, profile.id)))
      .returning({ id: commissionServices.id });
    if (!updated) throw new HttpError(404, "Servicio no encontrado");
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────
  // POST /api/artists/:artistId/verify-human — insignia anti-IA (solo ADMIN)
  // ───────────────────────────────────────────────────────────
  fastify.post("/:artistId/verify-human", async (request) => {
    const user = await requireUser(request);
    if (user.role !== "ADMIN") throw new HttpError(403, "Solo administradores");
    const { artistId } = request.params as { artistId: string };
    const { verified } = parseBody(z.object({ verified: z.boolean() }), request.body);
    const [updated] = await db
      .update(artistProfiles)
      .set({ isVerifiedHuman: verified })
      .where(eq(artistProfiles.id, artistId))
      .returning({ id: artistProfiles.id });
    if (!updated) throw new HttpError(404, "Artista no encontrado");
    return { ok: true };
  });
}

/** Descarga el avatar del artista (bucket público o URL externa https) para AUTO_AVATAR */
export async function loadAvatar(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  // Evita SSRF: solo https (CDN / Google / Discord) o nuestro propio storage local
  if (!url.startsWith("https://") && !url.startsWith(config.API_URL)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length < 10 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

