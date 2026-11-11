import "dotenv/config";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),

  /** URL pública de la API (ej: https://api.tupuestito.com.ar) */
  API_URL: z.string().url().default("http://localhost:4000"),
  /** URL pública del frontend (ej: https://tupuestito.com.ar) */
  WEB_URL: z.string().url().default("http://localhost:3000"),
  /** Dominio padre para compartir cookies entre web y api (ej: tupuestito.com.ar) */
  COOKIE_DOMAIN: z.string().optional(),

  DATABASE_URL: z
    .string()
    .default("postgresql://tupuestito:tupuestito_dev_password@localhost:5432/tupuestito"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // ── Better Auth ──
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: bool,

  // ── Cifrado de tokens OAuth de Mercado Pago (AES-256-GCM) ──
  /** 32 bytes en base64 o hex (openssl rand -base64 32) */
  ENCRYPTION_KEY: z.string().optional(),

  // ── Almacenamiento (Cloudflare R2 / S3) ──
  STORAGE_DRIVER: z.enum(["r2", "local"]).default("local"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BUCKET: z.string().optional(),
  R2_PRIVATE_BUCKET: z.string().optional(),
  /** Dominio público del bucket público (ej: https://cdn.tupuestito.com.ar) */
  R2_PUBLIC_URL: z.string().url().optional(),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),

  // ── Mercado Pago (Marketplace OAuth + Checkout Pro Split) ──
  /** "live" = API real (sandbox si usás credenciales de prueba); "mock" = simulador local SOLO desarrollo */
  PAYMENTS_MODE: z.enum(["live", "mock"]).default("mock"),
  MP_CLIENT_ID: z.string().optional(),
  MP_CLIENT_SECRET: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  MP_AUTH_URL: z.string().url().default("https://auth.mercadopago.com.ar/authorization"),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(5),

  // ── Notificaciones ──
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("TuPuestito <no-reply@tupuestito.com.ar>"),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),

  // ── Reglas de negocio ──
  DEPOSIT_EXPIRATION_HOURS: z.coerce.number().default(72),

  // ── Límites de subida (MB por archivo) ──
  MAX_AVATAR_MB: z.coerce.number().int().min(1).max(50).default(8),
  MAX_PORTFOLIO_MB: z.coerce.number().int().min(1).max(100).default(25),
  MAX_SKETCH_MB: z.coerce.number().int().min(1).max(100).default(30),
  /** Entrega final (imagen, .zip, .rar o .psd). Si lo subís, ajustá también request_body en deploy/Caddyfile */
  MAX_FINAL_DELIVERY_MB: z.coerce.number().int().min(1).max(2000).default(200)
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

const DEV_AUTH_SECRET = "dev_only_better_auth_secret_change_me_0123456789";
const DEV_ENCRYPTION_KEY = "ZGV2X29ubHlfZW5jcnlwdGlvbl9rZXlfMzJfYnl0ZXM="; // base64 de 32 bytes, solo dev

if (isProd) {
  const missing: string[] = [];
  if (!env.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  if (!env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (env.STORAGE_DRIVER !== "r2") missing.push("STORAGE_DRIVER=r2");
  if (env.PAYMENTS_MODE !== "live") missing.push("PAYMENTS_MODE=live");
  if (env.PAYMENTS_MODE === "live") {
    if (!env.MP_CLIENT_ID) missing.push("MP_CLIENT_ID");
    if (!env.MP_CLIENT_SECRET) missing.push("MP_CLIENT_SECRET");
    if (!env.MP_WEBHOOK_SECRET) missing.push("MP_WEBHOOK_SECRET");
  }
  if (!env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (missing.length > 0) {
    console.error(`❌ Configuración de producción incompleta: ${missing.join(", ")}`);
    process.exit(1);
  }
}

if (env.STORAGE_DRIVER === "r2") {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BUCKET",
    "R2_PRIVATE_BUCKET",
    "R2_PUBLIC_URL"
  ] as const;
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error(`❌ STORAGE_DRIVER=r2 requiere: ${missing.join(", ")}`);
    process.exit(1);
  }
}

export const config = {
  ...env,
  BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
  ENCRYPTION_KEY: env.ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
  PLATFORM_FEE_RATE: env.PLATFORM_FEE_PERCENT / 100
};
