import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { users, artistProfiles, portfolioItems, commissionServices, reviews } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { WatermarkService } from "../services/watermark.service.js";

export async function artistRoutes(fastify: FastifyInstance) {
  // GET /api/artists/explore — Directorio y búsqueda de artistas/comisiones
  fastify.get("/explore", async (request) => {
    const { q, rating } = request.query as any;

    const allArtists = db
      .select({
        id: artistProfiles.id,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        commissionStatus: artistProfiles.commissionStatus,
        isVerifiedHuman: artistProfiles.isVerifiedHuman,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl
      })
      .from(artistProfiles)
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .all();

    // Obtener servicios y portfolio de cada uno
    const result = allArtists.map((artist) => {
      const services = db
        .select()
        .from(commissionServices)
        .where(eq(commissionServices.artistId, artist.id))
        .all();

      const portfolio = db
        .select()
        .from(portfolioItems)
        .where(eq(portfolioItems.artistId, artist.id))
        .limit(4)
        .all();

      return {
        ...artist,
        services,
        portfolio
      };
    });

    return { artists: result };
  });

  // GET /api/artists/:username — Perfil público completo del artista
  fastify.get("/:username", async (request, reply) => {
    const { username } = request.params as any;

    const user = db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
    if (!user) {
      return reply.status(404).send({ error: "Artista no encontrado" });
    }

    const profile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).get();
    if (!profile) {
      return reply.status(404).send({ error: "Perfil de artista no encontrado" });
    }

    const portfolio = db
      .select()
      .from(portfolioItems)
      .where(eq(portfolioItems.artistId, profile.id))
      .orderBy(desc(portfolioItems.createdAt))
      .all();

    const services = db
      .select()
      .from(commissionServices)
      .where(eq(commissionServices.artistId, profile.id))
      .orderBy(desc(commissionServices.createdAt))
      .all();

    const artistReviews = db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        buyerName: users.displayName,
        buyerAvatar: users.avatarUrl
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.buyerId, users.id))
      .where(eq(reviews.artistId, profile.id))
      .orderBy(desc(reviews.createdAt))
      .all();

    return {
      artist: {
        id: profile.id,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: profile.bio,
        bannerUrl: profile.bannerUrl,
        commissionStatus: profile.commissionStatus,
        termsOfService: profile.termsOfService,
        isVerifiedHuman: profile.isVerifiedHuman,
        socialLinks: profile.socialLinks ? JSON.parse(profile.socialLinks) : {},
        defaultWatermarkMode: profile.defaultWatermarkMode
      },
      portfolio,
      services,
      reviews: artistReviews
    };
  });

  // PUT /api/artists/profile — Actualizar perfil (requiere Auth ARTIST)
  fastify.put("/profile", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const profile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, decoded.id)).get();
    if (!profile) {
      return reply.status(403).send({ error: "No sos un artista registrado" });
    }

    const body = request.body as any;
    db.update(artistProfiles)
      .set({
        bio: body.bio ?? profile.bio,
        bannerUrl: body.bannerUrl ?? profile.bannerUrl,
        commissionStatus: body.commissionStatus ?? profile.commissionStatus,
        defaultWatermarkMode: body.defaultWatermarkMode ?? profile.defaultWatermarkMode,
        watermarkCustomText: body.watermarkCustomText ?? profile.watermarkCustomText,
        termsOfService: body.termsOfService ?? profile.termsOfService,
        socialLinks: body.socialLinks ? JSON.stringify(body.socialLinks) : profile.socialLinks
      })
      .where(eq(artistProfiles.id, profile.id))
      .run();

    return { ok: true };
  });

  // POST /api/artists/portfolio — Subir obra al portfolio
  fastify.post("/portfolio", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const profile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, decoded.id)).get();
    if (!profile) {
      return reply.status(403).send({ error: "No autorizado" });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "Archivo requerido" });
    }

    const buffer = await data.toBuffer();
    const fields = (data.fields as any) || {};

    const title = fields.title?.value || "Obra sin título";
    const rating = fields.rating?.value || "SFW";
    const tags = fields.tags?.value ? JSON.stringify(fields.tags.value.split(",")) : "[]";
    const watermarkMode = fields.watermarkMode?.value || profile.defaultWatermarkMode;

    const processedBuffer = await WatermarkService.processImage(buffer, {
      mode: watermarkMode,
      customText: profile.watermarkCustomText || `@${decoded.username} • TuPuestito`
    });

    const imageUrl = await WatermarkService.saveUpload(processedBuffer, "webp");

    const itemId = crypto.randomUUID();
    db.insert(portfolioItems)
      .values({
        id: itemId,
        artistId: profile.id,
        title,
        imageUrl,
        rating,
        tags,
        createdAt: new Date().toISOString()
      })
      .run();

    return { id: itemId, imageUrl };
  });

  // POST /api/artists/services — Crear servicio de comisión
  fastify.post("/services", async (request, reply) => {
    const decoded = (await request.jwtVerify()) as any;
    const profile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, decoded.id)).get();
    if (!profile) {
      return reply.status(403).send({ error: "No autorizado" });
    }

    const {
      title,
      description,
      priceArs,
      priceUsd,
      paymentPlan,
      turnaroundDays,
      maxSlots,
      revisionsIncluded,
      rating,
      tags
    } = request.body as any;

    if (!title || !priceArs) {
      return reply.status(400).send({ error: "Título y precio en pesos son obligatorios" });
    }

    const serviceId = crypto.randomUUID();
    db.insert(commissionServices)
      .values({
        id: serviceId,
        artistId: profile.id,
        title,
        description: description || "",
        priceArs: Number(priceArs),
        priceUsd: priceUsd ? Number(priceUsd) : null,
        paymentPlan: paymentPlan || "SPLIT_ON_SKETCH",
        turnaroundDays: Number(turnaroundDays) || 14,
        maxSlots: Number(maxSlots) || 3,
        revisionsIncluded: Number(revisionsIncluded) || 2,
        rating: rating || "SFW",
        tags: tags ? JSON.stringify(tags) : "[]",
        createdAt: new Date().toISOString()
      })
      .run();

    return { id: serviceId, ok: true };
  });
}

