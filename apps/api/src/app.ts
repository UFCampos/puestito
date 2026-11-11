import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { config, isProd } from "./config.js";
import { auth } from "./auth.js";
import { HttpError } from "./lib/http.js";
import { pool } from "./db/index.js";
import { meRoutes } from "./routes/me.routes.js";
import { artistRoutes } from "./routes/artist.routes.js";
import { orderRoutes } from "./routes/order.routes.js";
import { paymentRoutes } from "./routes/payment.routes.js";
import { localFileRoutes, uploadRoutes } from "./routes/files.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: isProd ? "info" : "debug", redact: ["req.headers.cookie", "req.headers.authorization"] },
    trustProxy: true, // detrás de Caddy
    bodyLimit: 1024 * 1024
  });

  // Formularios HTML (solo lo usa el simulador de pagos en desarrollo)
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, {
    origin: [config.WEB_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  await app.register(cookie, { secret: config.BETTER_AUTH_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024, files: 2, fields: 20 } });

  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) return reply.status(error.statusCode).send({ error: error.message });
    const status = (error as FastifyError).statusCode ?? 500;
    if (status >= 500) request.log.error({ err: error }, "Error no controlado");
    if (status === 413 || (error as FastifyError).code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({ error: "El archivo es demasiado grande" });
    }
    return reply.status(status).send({
      error: status >= 500 && isProd ? "Error interno. Probá de nuevo en unos minutos." : error.message
    });
  });

  app.get("/health", async () => {
    await pool.query("select 1");
    return { status: "ok", app: "TuPuestito API", version: "1.0.0", timestamp: new Date().toISOString() };
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
  await app.register(paymentRoutes, { prefix: "/api/payments" });
  await app.register(uploadRoutes, { prefix: "/api/uploads" });
  await app.register(localFileRoutes, { prefix: "/files" });

  return app;
}
