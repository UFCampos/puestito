import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, ".pgdata");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`Iniciando PostgreSQL embebido en ${dataDir}...`);
const db = await PGlite.create(dataDir);
const port = parseInt(process.env.PG_PORT || "5432", 10);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`✅ PostgreSQL (PGlite) escuchando en 127.0.0.1:${port}`);
console.log(`Base de datos lista para TuPuestito. Presioná Ctrl+C para detener.`);
