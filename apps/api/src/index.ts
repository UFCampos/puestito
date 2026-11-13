import { and, eq, inArray, ne } from "drizzle-orm";
import { config } from "./config.js";
import { buildApp } from "./app.js";
import { db, pool, runMigrations } from "./db/index.js";
import { users } from "./db/schema.js";
import { alertOps } from "./services/notification.service.js";
import { hasActivity, runOrderTimers } from "./services/timers.service.js";
import { runCleanup } from "./services/cleanup.service.js";

await runMigrations();
const app = await buildApp();

// Alta del equipo de moderación: los emails de ADMIN_EMAILS pasan a ADMIN, pero solo con el email
// verificado (si no, cualquiera podría registrarse con ese email antes que su dueño).
// Las cuentas que todavía no existen o no verificaron se promueven solas al ingresar (GET /api/me).
if (config.ADMIN_EMAIL_LIST.length > 0) {
  const promoted = await db
    .update(users)
    .set({ role: "ADMIN" })
    .where(and(inArray(users.email, config.ADMIN_EMAIL_LIST), eq(users.emailVerified, true), ne(users.role, "ADMIN")))
    .returning({ username: users.username });
  if (promoted.length > 0) app.log.info(`🛡️ Nuevos admins: ${promoted.map((u) => `@${u.username}`).join(", ")}`);
}

// ── Tareas programadas ──
// Plazos de los pedidos (vencimientos, recordatorios, aprobaciones automáticas, atrasos)
let timersRunning = false;
async function tickTimers() {
  if (timersRunning) return;
  timersRunning = true;
  try {
    const report = await runOrderTimers();
    if (hasActivity(report)) app.log.info({ report }, "⏱️ Plazos automáticos");
  } catch (err) {
    app.log.error({ err }, "Error en los plazos automáticos");
    alertOps("job:timers", `Fallaron los plazos automáticos: ${(err as Error).message}`);
  } finally {
    timersRunning = false;
  }
}

// Limpieza de archivos y registros viejos: una vez por día
async function tickCleanup() {
  try {
    const report = await runCleanup();
    if (Object.values(report).some((n) => n > 0)) app.log.info({ report }, "🧹 Limpieza diaria");
  } catch (err) {
    app.log.error({ err }, "Error en la limpieza diaria");
    alertOps("job:cleanup", `Falló la limpieza diaria: ${(err as Error).message}`);
  }
}

const jobsEnabled = config.JOBS_INTERVAL_MINUTES > 0;
const timers: NodeJS.Timeout[] = [];
if (jobsEnabled) {
  timers.push(setInterval(() => void tickTimers(), config.JOBS_INTERVAL_MINUTES * 60_000));
  timers.push(setInterval(() => void tickCleanup(), 24 * 3600_000));
  // La primera limpieza corre un rato después de levantar, para no competir con el arranque
  timers.push(setTimeout(() => void tickCleanup(), 5 * 60_000));
}

async function shutdown(signal: string) {
  app.log.info(`Recibido ${signal}, cerrando...`);
  timers.forEach((t) => clearTimeout(t));
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Un error que nadie atrapó deja el proceso en un estado dudoso: se avisa y Docker lo reinicia
process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "Promesa rechazada sin manejar");
  alertOps("unhandledRejection", `Promesa rechazada sin manejar en la API: ${String((reason as Error)?.message ?? reason).slice(0, 300)}`);
});
process.on("uncaughtException", (err) => {
  app.log.fatal({ err }, "Excepción no capturada: la API se reinicia");
  alertOps("uncaughtException", `Excepción no capturada: la API se reinicia. ${err.message.slice(0, 300)}`);
  setTimeout(() => process.exit(1), 1500);
});

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  if (jobsEnabled) void tickTimers();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
