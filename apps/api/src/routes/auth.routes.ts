import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { users, artistProfiles } from "../db/schema.js";
import { eq, or } from "drizzle-orm";

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register
  fastify.post("/register", async (request, reply) => {
    const { email, password, username, displayName, isArtist } = request.body as any;

    if (!email || !password || !username || !displayName) {
      return reply.status(400).send({ error: "Faltan campos obligatorios" });
    }

    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");

    // Verificar si ya existe usuario o email
    const existing = db
      .select()
      .from(users)
      .where(or(eq(users.email, email.toLowerCase().trim()), eq(users.username, cleanUsername)))
      .get();

    if (existing) {
      return reply.status(409).send({ error: "El email o nombre de usuario ya está registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(users)
      .values({
        id: userId,
        email: email.toLowerCase().trim(),
        passwordHash,
        username: cleanUsername,
        displayName: displayName.trim(),
        role: isArtist ? "ARTIST" : "BUYER",
        createdAt: now
      })
      .run();

    // Si se registró como artista, crear perfil base
    if (isArtist) {
      db.insert(artistProfiles)
        .values({
          id: crypto.randomUUID(),
          userId,
          bio: "¡Hola! Bienvenido a mi puestito virtual de arte ✨",
          commissionStatus: "OPEN",
          defaultWatermarkMode: "AUTO_TEXT",
          watermarkCustomText: `@${cleanUsername} • TuPuestito`,
          termsOfService: "1. No reembolsable una vez aprobado el boceto.\n2. Solo uso personal.\n3. Tiempo de entrega estimado según la comisión.",
          createdAt: now
        })
        .run();
    }

    const token = fastify.jwt.sign({ id: userId, username: cleanUsername, role: isArtist ? "ARTIST" : "BUYER" });

    reply.setCookie("token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30 // 30 días
    });

    return {
      user: {
        id: userId,
        email,
        username: cleanUsername,
        displayName,
        role: isArtist ? "ARTIST" : "BUYER"
      },
      token
    };
  });

  // POST /api/auth/login
  fastify.post("/login", async (request, reply) => {
    const { login, password } = request.body as any; // login puede ser email o username

    if (!login || !password) {
      return reply.status(400).send({ error: "Email/Usuario y contraseña requeridos" });
    }

    const clean = login.toLowerCase().trim();
    const user = db
      .select()
      .from(users)
      .where(or(eq(users.email, clean), eq(users.username, clean)))
      .get();

    if (!user) {
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });

    reply.setCookie("token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      },
      token
    };
  });

  // GET /api/auth/me
  fastify.get("/me", async (request, reply) => {
    try {
      const decoded = await request.jwtVerify() as any;
      const user = db.select().from(users).where(eq(users.id, decoded.id)).get();
      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      let artistProfile = null;
      if (user.role === "ARTIST") {
        artistProfile = db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).get();
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
          showNsfw: user.showNsfw
        },
        artistProfile
      };
    } catch {
      return reply.status(401).send({ error: "No autenticado" });
    }
  });

  // POST /api/auth/logout
  fastify.post("/logout", async (_request, reply) => {
    reply.clearCookie("token", { path: "/" });
    return { ok: true };
  });
}

