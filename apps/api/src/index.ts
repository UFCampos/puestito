import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";

import { initDb } from "./db/index.js";
import { authRoutes } from "./routes/auth.routes.js";
import { artistRoutes } from "./routes/artist.routes.js";
import { orderRoutes } from "./routes/order.routes.js";
import { paymentRoutes } from "./routes/payment.routes.js";

// Inicializar tablas en SQLite
initDb();

const fastify = Fastify({
  logger: true
});

// Plugins esenciales
await fastify.register(cors, {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
});

await fastify.register(cookie);

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || "tupuestito_dev_jwt_secret_key_1234567890",
  cookie: {
    cookieName: "token",
    signed: false
  }
});

await fastify.register(multipart, {
  limits: {
    fileSize: 30 * 1024 * 1024 // 30 MB máx por archivo
  }
});

// Servir archivos estáticos subidos (para dev y VPS)
const uploadsDir = path.resolve(process.cwd(), "uploads");
await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: "/uploads/"
});

// Health check
fastify.get("/health", async () => {
  return {
    status: "ok",
    app: "TuPuestito API",
    version: "0.1.0",
    timestamp: new Date().toISOString()
  };
});

// Rutas modulares
await fastify.register(authRoutes, { prefix: "/api/auth" });
await fastify.register(artistRoutes, { prefix: "/api/artists" });
await fastify.register(orderRoutes, { prefix: "/api/orders" });
await fastify.register(paymentRoutes, { prefix: "/api/payments" });

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 4000;
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`\n🎪 TuPuestito Backend escuchando en: http://localhost:${port}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
