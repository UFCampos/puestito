import type { FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";
import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { artistProfiles } from "../db/schema.js";
import { config } from "../config.js";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  username: string;
  image: string | null;
  role: "BUYER" | "ARTIST" | "ADMIN";
  showNsfw: boolean;
  emailVerified: boolean;
  /** Cuenta suspendida por moderación: puede leer, pero no hacer nada */
  suspended: boolean;
}

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    username?: string | null;
    role?: string;
    showNsfw?: boolean;
    suspendedAt?: Date | string | null;
    deletedAt?: Date | string | null;
  };
  // Una cuenta eliminada no tiene sesiones, pero por las dudas no la damos por válida
  if (u.deletedAt) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    username: u.username ?? "",
    image: u.image ?? null,
    role: (u.role as SessionUser["role"]) ?? "BUYER",
    showNsfw: Boolean(u.showNsfw),
    emailVerified: u.emailVerified,
    suspended: Boolean(u.suspendedAt)
  };
}

/**
 * Usuario de la sesión. Una cuenta suspendida puede seguir consultando (GET) sus pedidos y
 * descargando lo que pagó, pero no puede crear, pagar, entregar ni escribir.
 * `allowSuspended` es para lo que tiene que poder hacer igual: exportar o eliminar sus datos.
 */
export async function requireUser(request: FastifyRequest, opts: { allowSuspended?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new HttpError(401, "Tenés que iniciar sesión");
  if (user.suspended && !opts.allowSuspended && request.method !== "GET") {
    throw new HttpError(
      403,
      `Tu cuenta está suspendida y no puede realizar esta acción. Si creés que es un error, escribinos a ${config.SUPPORT_EMAIL}.`
    );
  }
  return user;
}

export async function requireArtist(request: FastifyRequest) {
  const user = await requireUser(request);
  const [profile] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
  if (!profile) throw new HttpError(403, "Necesitás un perfil de artista para hacer esto");
  return { user, profile };
}

export async function requireAdmin(request: FastifyRequest): Promise<SessionUser> {
  const user = await requireUser(request);
  // 404 y no 403: el panel de moderación no existe para quien no es del equipo
  if (user.role !== "ADMIN" || user.suspended) throw new HttpError(404, "No encontrado");
  return user;
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): ZodInfer<S> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Datos inválidos");
  }
  return result.data;
}
