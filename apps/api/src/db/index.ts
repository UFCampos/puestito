import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

const dbDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(path.join(dbDir, "tupuestito.db"));
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'BUYER',
      show_nsfw INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artist_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT,
      banner_url TEXT,
      commission_status TEXT NOT NULL DEFAULT 'CLOSED',
      default_watermark_mode TEXT NOT NULL DEFAULT 'AUTO_TEXT',
      watermark_custom_text TEXT,
      terms_of_service TEXT,
      is_verified_human INTEGER NOT NULL DEFAULT 0,
      social_links TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_items (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      rating TEXT NOT NULL DEFAULT 'SFW',
      tags TEXT,
      wip_proof_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_accounts (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      token_expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commission_services (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price_ars INTEGER NOT NULL,
      price_usd INTEGER,
      payment_plan TEXT NOT NULL DEFAULT 'SPLIT_ON_SKETCH',
      turnaround_days INTEGER NOT NULL DEFAULT 14,
      max_slots INTEGER NOT NULL DEFAULT 3,
      revisions_included INTEGER NOT NULL DEFAULT 2,
      rating TEXT NOT NULL DEFAULT 'SFW',
      tags TEXT,
      example_images TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commission_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      artist_id TEXT NOT NULL REFERENCES artist_profiles(id),
      service_id TEXT NOT NULL REFERENCES commission_services(id),
      status TEXT NOT NULL DEFAULT 'REQUESTED',
      payment_plan_snapshot TEXT NOT NULL,
      terms_snapshot TEXT NOT NULL,
      terms_accepted_at TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ARS',
      total_amount INTEGER NOT NULL,
      platform_fee_amount INTEGER NOT NULL,
      deposit_amount INTEGER NOT NULL,
      final_amount INTEGER NOT NULL,
      buyer_brief TEXT NOT NULL,
      reference_images TEXT,
      external_board_url TEXT,
      sketch_watermarked_url TEXT,
      preview_watermarked_url TEXT,
      final_hd_private_key TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_milestone_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES commission_orders(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'MERCADOPAGO',
      gross_amount INTEGER NOT NULL,
      marketplace_fee INTEGER NOT NULL,
      mp_preference_id TEXT,
      mp_payment_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      paid_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES commission_orders(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL DEFAULT 'TEXT',
      content TEXT NOT NULL,
      attachments TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES commission_orders(id) ON DELETE CASCADE,
      artist_id TEXT NOT NULL REFERENCES artist_profiles(id),
      buyer_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL
    );
  `);
}
