import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { TERMS_VERSION, config, isProd, relaxLimits } from "./config.js";
import { auth } from "./auth.js";
import { HttpError, parseBody } from "./lib/http.js";
import { pool } from "./db/index.js";
import { LIMITS, LIMITS_MB } from "./lib/limits.js";
import { alertOps } from "./services/notification.service.js";
import { meRoutes } from "./routes/me.routes.js";
import { artistRoutes } from "./routes/artist.routes.js";
import { orderRoutes } from "./routes/order.routes.js";
import { orderResolutionRoutes } from "./routes/order-resolution.routes.js";
import { paymentRoutes } from "./routes/payment.routes.js";
import { reportRoutes } from "./routes/report.routes.js";
import { supportRoutes } from "./routes/support.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { localFileRoutes, uploadRoutes } from "./routes/files.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: isProd ? "info" : "debug", redact: ["req.headers.cookie", "req.headers.authorization"] },
    trustProxy: true, // detrás de Caddy
    bodyLimit: 1024 * 1024
  });

  // Formularios HTML: solo los usa el simulador de pagos, que no existe en producción
  if (!isProd) {
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, {
    origin: [config.WEB_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  await app.register(cookie, { secret: config.BETTER_AUTH_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute", allowList: relaxLimits ? () => true : undefined });
  // Límite por defecto; cada ruta fija el suyo (ver src/lib/limits.ts)
  await app.register(multipart, { limits: { fileSize: LIMITS.sketchBytes, files: 2, fields: 20 } });

  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) return reply.status(error.statusCode).send({ error: error.message });
    const status = (error as FastifyError).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "Error no controlado");
      // Un 5xx inesperado es un bug o una caída de un servicio externo: que el equipo se entere
      const route = `${request.method} ${request.routeOptions?.url ?? request.url.split("?")[0]}`;
      alertOps(`500:${route}:${error.message}`, `Error ${status} en ${route}: ${error.message.slice(0, 300)}`);
    }
    if (status === 413 || (error as FastifyError).code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({ error: "El archivo es demasiado grande" });
    }
    if (status === 429) return reply.status(429).send({ error: "Demasiadas solicitudes seguidas. Esperá un momento y probá de nuevo." });
    return reply.status(status).send({
      error: status >= 500 && isProd ? "Error interno. Probá de nuevo en unos minutos." : error.message
    });
  });

  // Salud del servicio: la usan el healthcheck de Docker, el deploy y el monitor externo
  app.get("/health", { config: { rateLimit: false } }, async () => {
    await pool.query("select 1");
    return { status: "ok", app: "TuPuestito API", version: config.APP_VERSION, timestamp: new Date().toISOString() };
  });

  // Límites y reglas que el frontend muestra y valida antes de subir
  app.get("/api/config", async () => ({
    uploadLimitsMb: LIMITS_MB,
    finalDeliveryFormats: ["png", "jpg", "webp", "zip", "rar", "psd"],
    platformFeePercent: config.PLATFORM_FEE_PERCENT,
    depositExpirationHours: config.DEPOSIT_EXPIRATION_HOURS,
    requestExpirationDays: config.REQUEST_EXPIRATION_DAYS,
    reviewAutoApproveDays: config.REVIEW_AUTO_APPROVE_DAYS,
    paymentTimeoutDays: config.PAYMENT_TIMEOUT_DAYS,
    postDeliveryDisputeDays: config.POST_DELIVERY_DISPUTE_DAYS,
    supportEmail: config.SUPPORT_EMAIL,
    termsVersion: TERMS_VERSION
  }));

  // Errores del navegador (pantalla de error de la web): llegan al mismo canal que los del servidor
  app.post("/api/client-errors", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const body = parseBody(
      z.object({
        message: z.string().max(500),
        path: z.string().max(300).default(""),
        digest: z.string().max(100).optional()
      }),
      request.body
    );
    request.log.warn({ clientError: body }, "Error en el frontend");
    alertOps(`web:${body.path}:${body.message}`, `Error en la web (${body.path || "/"}): ${body.message}${body.digest ? ` [${body.digest}]` : ""}`);
    return { ok: true };
  });

  // ── Better Auth (email+password, Google, Discord, username) ──
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: { rateLimit: false }, // Better Auth tiene su propio rate limit
    async handler(request, reply) {
      const url = new URL(request.url, config.API_URL);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined) headers.append(key, Array.isArray(value) ? value.join(", ") : String(value));
      }
      const req = new Request(url, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.body !== undefined ? JSON.stringify(request.body) : undefined
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(response.body ? await response.text() : null);
    }
  });

  await app.register(meRoutes, { prefix: "/api/me" });
  await app.register(artistRoutes, { prefix: "/api/artists" });
  await app.register(orderRoutes, { prefix: "/api/orders" });
  await app.register(orderResolutionRoutes, { prefix: "/api/orders" });
  await app.register(paymentRoutes, { prefix: "/api/payments" });
  await app.register(reportRoutes, { prefix: "/api/reports" });
  await app.register(supportRoutes, { prefix: "/api/support" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(uploadRoutes, { prefix: "/api/uploads" });
  await app.register(localFileRoutes, { prefix: "/files" });

  return app;
}
