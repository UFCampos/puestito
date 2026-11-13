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
  /** Solo desarrollo y tests: desactiva los límites de pedidos por minuto (en producción se ignora) */
  RELAX_RATE_LIMITS: bool,

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
  /** Una solicitud que el artista no responde vence sola pasado este plazo */
  REQUEST_EXPIRATION_DAYS: z.coerce.number().positive().default(7),
  /** Si el comprador no revisa una entrega (boceto, vista previa o etapa) se aprueba automáticamente */
  REVIEW_AUTO_APPROVE_DAYS: z.coerce.number().positive().default(7),
  /** Pasado este plazo sin el pago de la etapa siguiente, el artista puede cerrar el pedido */
  PAYMENT_TIMEOUT_DAYS: z.coerce.number().positive().default(14),
  /** Días de atraso del artista a partir de los cuales se avisa a moderación */
  OVERDUE_ESCALATION_DAYS: z.coerce.number().positive().default(7),
  /** Ventana para reclamar después de recibir la entrega final */
  POST_DELIVERY_DISPUTE_DAYS: z.coerce.number().min(0).default(7),
  /** Días que se conservan los archivos de pedidos rechazados, vencidos o cancelados */
  ORDER_FILES_RETENTION_DAYS: z.coerce.number().positive().default(30),
  /** Cada cuántos minutos corren los plazos automáticos (0 = desactivado; se pueden correr a mano desde /admin) */
  JOBS_INTERVAL_MINUTES: z.coerce.number().min(0).default(10),

  // ── Soporte y moderación ──
  /** Casilla que recibe consultas, reclamos y pedidos de arrepentimiento */
  SUPPORT_EMAIL: z.string().email().default("soporte@tupuestito.com.ar"),
  /** Emails (separados por coma) que pasan a ser ADMIN una vez verificados */
  ADMIN_EMAILS: z.string().default(""),
  /** Versión del build, para /health (la define el script de deploy) */
  APP_VERSION: z.string().default("dev"),

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
/** Los tests e2e hacen en segundos lo que una persona hace en días: necesitan saltear los límites */
export const relaxLimits = !isProd && env.RELAX_RATE_LIMITS;

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

/** Versión vigente de los Términos y la Política de Privacidad (se guarda junto a cada aceptación) */
export const TERMS_VERSION = "2026-11";

export const config = {
  ...env,
  BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
  ENCRYPTION_KEY: env.ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
  PLATFORM_FEE_RATE: env.PLATFORM_FEE_PERCENT / 100,
  ADMIN_EMAIL_LIST: env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
};
