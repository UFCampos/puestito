import type { FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";
import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { artistProfiles } from "../db/schema.js";

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
}

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    username?: string | null;
    role?: string;
    showNsfw?: boolean;
  };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    username: u.username ?? "",
    image: u.image ?? null,
    role: (u.role as SessionUser["role"]) ?? "BUYER",
    showNsfw: Boolean(u.showNsfw),
    emailVerified: u.emailVerified
  };
}

export async function requireUser(request: FastifyRequest): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new HttpError(401, "Tenés que iniciar sesión");
  return user;
}

export async function requireArtist(request: FastifyRequest) {
  const user = await requireUser(request);
  const [profile] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
  if (!profile) throw new HttpError(403, "Necesitás un perfil de artista para hacer esto");
  return { user, profile };
}

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): ZodInfer<S> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Datos inválidos");
  }
  return result.data;
}
