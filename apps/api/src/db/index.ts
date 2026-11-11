import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";
import { config } from "../config.js";

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
/** Tipo común para `db` o una transacción */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle"
);

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
