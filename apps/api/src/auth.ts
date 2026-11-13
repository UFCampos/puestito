import crypto from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { users, sessions, accounts, verifications } from "./db/schema.js";
import { TERMS_VERSION, config, isProd, relaxLimits } from "./config.js";
import { sendEmail, html } from "./services/notification.service.js";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const RESERVED = new Set([
  "admin",
  "api",
  "dashboard",
  "login",
  "register",
  "orders",
  "my-orders",
  "terms",
  "privacy",
  "u",
  "tupuestito",
  "soporte",
  "support",
  "ayuda",
  "cuenta",
  "arrepentimiento",
  "moderacion",
  "eliminado",
  "sistema",
  // Chocarían con GET /api/artists/explore y /api/artists/sitemap
  "explore",
  "sitemap"
]);

/** Genera un @username libre para altas vía Google/Discord */
async function uniqueUsernameFrom(seed: string): Promise<string> {
  const base =
    seed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) || "artista";
  const padded = base.length < 3 ? `${base}_tp` : base;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 && !RESERVED.has(padded) ? padded : `${padded}_${crypto.randomInt(100, 99999)}`;
    const taken = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1);
    if (taken.length === 0) return candidate;
  }
  return `user_${crypto.randomUUID().slice(0, 8)}`;
}

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET
  };
}
if (config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET) {
  socialProviders.discord = {
    clientId: config.DISCORD_CLIENT_ID,
    clientSecret: config.DISCORD_CLIENT_SECRET
  };
}

export const auth = betterAuth({
  appName: "TuPuestito",
  baseURL: config.API_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.WEB_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications }
  }),
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: isProd,
    ...(config.COOKIE_DOMAIN
      ? { crossSubDomainCookies: { enabled: true, domain: config.COOKIE_DOMAIN } }
      : {})
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "BUYER", input: false },
      showNsfw: { type: "boolean", required: false, defaultValue: false, input: false },
      // Moderación y consentimiento: nunca los puede fijar el cliente (input: false)
      suspendedAt: { type: "date", required: false, input: false },
      deletedAt: { type: "date", required: false, input: false },
      termsAcceptedAt: { type: "date", required: false, input: false },
      termsVersion: { type: "string", required: false, input: false }
    }
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Restablecé tu contraseña de TuPuestito",
        title: "Restablecer contraseña",
        html: `<p>Hola ${html.escape(user.name)}, recibimos un pedido para cambiar tu contraseña. Si no fuiste vos, ignorá este correo.</p>`,
        cta: { label: "Elegir nueva contraseña", url }
      });
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Confirmá tu email en TuPuestito",
        title: "¡Bienvenido/a a TuPuestito!",
        html: `<p>Hola ${html.escape(user.name)}, confirmá tu dirección de correo para recibir avisos de tus pedidos.</p>`,
        cta: { label: "Confirmar email", url }
      });
    }
  },
  socialProviders,
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (u) => USERNAME_RE.test(u) && !RESERVED.has(u)
    })
  ],
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          // Altas por Google / Discord no traen @username: generamos uno libre.
          const u = user as typeof user & { username?: string | null; displayUsername?: string | null };
          // Crear la cuenta implica aceptar los Términos y la Política de Privacidad vigentes
          // (casilla obligatoria en el registro, aviso junto a los botones de Google/Discord).
          const consent = { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION };
          if (!u.username) {
            const generated = await uniqueUsernameFrom(u.name || u.email.split("@")[0]);
            return { data: { ...user, ...consent, username: generated, displayUsername: generated } };
          }
          return { data: { ...user, ...consent } };
        }
      }
    }
  },
  rateLimit: {
    enabled: !relaxLimits,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 }
    }
  }
});

export type AuthSession = typeof auth.$Infer.Session;
