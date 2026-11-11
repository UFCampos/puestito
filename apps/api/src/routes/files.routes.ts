import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_REFERENCE_BYTES,
  extensionFor,
  isSafeKey,
  newKey,
  storage,
  verifyLocalSignature,
  type Visibility
} from "../services/storage.service.js";

/**
 * POST /api/uploads/reference — URL firmada para subir una referencia directo al bucket privado
 * (Plan §6: hasta 10 imágenes PNG/JPG/WebP de máx. 5 MB c/u).
 */
export async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post("/reference", { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const body = parseBody(
      z.object({
        contentType: z.enum(ALLOWED_IMAGE_TYPES),
        size: z.number().int().positive().max(MAX_REFERENCE_BYTES, "Cada imagen puede pesar como máximo 5 MB")
      }),
      request.body
    );
    const key = newKey(`refs/${user.id}`, extensionFor(body.contentType));
    const signed = await storage.signedPutUrl("private", key, body.contentType, body.size);
    return { key, uploadUrl: signed.url, headers: signed.headers };
  });
}

/**
 * Rutas /files/* — SOLO con STORAGE_DRIVER=local (en producción sirve R2 directamente).
 */
export async function localFileRoutes(fastify: FastifyInstance) {
  if (config.STORAGE_DRIVER !== "local") return;

  fastify.get("/public/*", async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    if (!isSafeKey(key)) throw new HttpError(400, "Key inválida");
    const file = await storage.get("public", key);
    if (!file) throw new HttpError(404, "Archivo no encontrado");
    return reply
      .header("Content-Type", file.contentType)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("Cross-Origin-Resource-Policy", "cross-origin")
      .send(file.body);
  });

  fastify.get("/private/*", async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    const q = request.query as { exp?: string; sig?: string; dl?: string };
    if (!isSafeKey(key) || !verifyLocalSignature("get", key, Number(q.exp), q.sig ?? "", q.dl ?? "")) {
      throw new HttpError(403, "Link vencido o inválido");
    }
    const file = await storage.get("private", key);
    if (!file) throw new HttpError(404, "Archivo no encontrado");
    reply
      .header("Content-Type", file.contentType)
      .header("Cache-Control", "private, no-store")
      .header("Cross-Origin-Resource-Policy", "cross-origin");
    if (q.dl) reply.header("Content-Disposition", `attachment; filename="${q.dl.replace(/["\\\r\n]/g, "")}"`);
    return reply.send(file.body);
  });

  // Subida con URL firmada (emula el PUT presignado de R2)
  fastify.addContentTypeParser(
    ["image/png", "image/jpeg", "image/webp"],
    { parseAs: "buffer", bodyLimit: MAX_REFERENCE_BYTES },
    (_req, body, done) => done(null, body)
  );

  fastify.put("/upload/*", async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    const q = request.query as { exp?: string; sig?: string; v?: string; ct?: string; len?: string };
    const visibility = q.v as Visibility;
    const extra = `${visibility}:${q.ct}:${q.len}`;
    if (!isSafeKey(key) || !verifyLocalSignature("put", key, Number(q.exp), q.sig ?? "", extra)) {
      throw new HttpError(403, "Link de subida vencido o inválido");
    }
    const body = request.body as Buffer;
    if (request.headers["content-type"] !== q.ct || !Buffer.isBuffer(body) || body.length !== Number(q.len)) {
      throw new HttpError(400, "El archivo no coincide con la subida autorizada");
    }
    await storage.put(visibility, key, body, q.ct!);
    return reply.status(200).send({ ok: true });
  });
}
