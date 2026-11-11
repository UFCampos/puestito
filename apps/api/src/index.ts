import { config } from "./config.js";
import { buildApp } from "./app.js";
import { pool, runMigrations } from "./db/index.js";
import { expireUnpaidOrders } from "./services/order.service.js";

await runMigrations();
const app = await buildApp();

// Plan §4: ACCEPTED_WAITING_DEPOSIT → EXPIRED si no paga en 72 hs
const expireTimer = setInterval(() => {
  expireUnpaidOrders()
    .then((n) => n > 0 && app.log.info(`⌛ ${n} pedido(s) vencidos por falta de pago`))
    .catch((err) => app.log.error({ err }, "Error en el job de vencimientos"));
}, 10 * 60 * 1000);

async function shutdown(signal: string) {
  app.log.info(`Recibido ${signal}, cerrando...`);
  clearInterval(expireTimer);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  void expireUnpaidOrders().catch(() => {});
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
