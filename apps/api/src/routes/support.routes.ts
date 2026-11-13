import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { commissionOrders, supportMessages, users } from "../db/schema.js";
import { config } from "../config.js";
import { HttpError, getSessionUser, parseBody } from "../lib/http.js";
import { html, notifyDiscord, sendEmail } from "../services/notification.service.js";
import { addSystemMessage, notifyOrder } from "../services/order.service.js";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin 0/O ni 1/I: se dicta por teléfono sin errores

/** Código de gestión legible, p. ej. ARR-7F3K2QXM */
function newCode(prefix: string): string {
  const bytes = crypto.randomBytes(8);
  return `${prefix}-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

const person = {
  name: z.string().trim().min(2, "Decinos tu nombre").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(200),
  /** Campo trampa: las personas no lo ven; los bots lo completan */
  website: z.string().max(0).optional()
};

const orderNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^#?PST-\d{1,10}$/, "El número de pedido tiene la forma PST-1042")
  .transform((v) => v.replace(/^#/, ""));

/**
 * Canales de contacto públicos. No requieren sesión: el botón de arrepentimiento, por
 * normativa (Res. 424/2020 SCI), tiene que poder usarse sin registrarse ni iniciar sesión.
 */
export async function supportRoutes(fastify: FastifyInstance) {
  const limits = { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } };

  // POST /api/support/contact — consulta o reclamo a soporte
  fastify.post("/contact", limits, async (request) => {
    const body = parseBody(
      z.object({
        ...person,
        orderNumber: orderNumber.optional().or(z.literal("").transform(() => undefined)),
        message: z.string().trim().min(10, "Contanos un poco más para poder ayudarte").max(4000)
      }),
      request.body
    );
    const user = await getSessionUser(request);
    const code = newCode("SOP");
    await db.insert(supportMessages).values({
      kind: "CONTACT",
      code,
      userId: user?.id ?? null,
      name: body.name,
      email: body.email,
      orderNumber: body.orderNumber ?? null,
      message: body.message
    });

    await sendEmail({
      to: config.SUPPORT_EMAIL,
      replyTo: body.email,
      subject: `[${code}] Consulta de ${body.name}`,
      title: `Consulta ${code}`,
      html: `<p><strong>${html.escape(body.name)}</strong> &lt;${html.escape(body.email)}&gt;${user ? ` (@${html.escape(user.username)})` : ""}${body.orderNumber ? ` · pedido #${html.escape(body.orderNumber)}` : ""}</p><p>${html.escape(body.message).replace(/\n/g, "<br/>")}</p>`
    });
    void sendEmail({
      to: body.email,
      subject: `Recibimos tu consulta (${code})`,
      title: "Recibimos tu consulta",
      html: `<p>Hola ${html.escape(body.name)},</p><p>Tu consulta quedó registrada con el código <strong>${code}</strong>. Te vamos a responder a este correo lo antes posible.</p>`
    });
    void notifyDiscord(`📨 Consulta ${code} de ${body.name}${body.orderNumber ? ` (#${body.orderNumber})` : ""}: ${body.message.slice(0, 300)}`);
    return { ok: true, code };
  });

  // POST /api/support/arrepentimiento — Botón de arrepentimiento (Res. 424/2020, art. 34 Ley 24.240)
  // Se registra, se le asigna un código y se confirma por email dentro de las 24 hs (acá, al instante).
  fastify.post("/arrepentimiento", limits, async (request) => {
    const body = parseBody(
      z.object({
        ...person,
        orderNumber,
        message: z.string().trim().max(4000).default("")
      }),
      request.body
    );
    const user = await getSessionUser(request);
    const code = newCode("ARR");
    await db.insert(supportMessages).values({
      kind: "ARREPENTIMIENTO",
      code,
      userId: user?.id ?? null,
      name: body.name,
      email: body.email,
      orderNumber: body.orderNumber,
      message: body.message
    });

    // Si el pedido existe y es de esa persona, queda asentado en el propio pedido y se avisa al artista
    const [row] = await db
      .select({ order: commissionOrders, buyerEmail: users.email })
      .from(commissionOrders)
      .innerJoin(users, eq(commissionOrders.buyerId, users.id))
      .where(eq(commissionOrders.orderNumber, body.orderNumber))
      .limit(1);
    const matches = Boolean(row && (row.buyerEmail.toLowerCase() === body.email || row.order.buyerId === user?.id));
    if (row && matches) {
      await addSystemMessage(
        db,
        row.order.id,
        `↩️ El comprador ejerció el botón de arrepentimiento (código ${code}). El equipo de TuPuestito va a contactar a las partes.`
      );
      void notifyOrder(
        row.order,
        "artist",
        "El comprador pidió revocar la compra",
        `El comprador usó el botón de arrepentimiento sobre este pedido (código ${code}). Te vamos a contactar para definir cómo sigue; mientras tanto podés hablarlo por el chat del pedido.`
      );
    }

    const sent = await sendEmail({
      to: body.email,
      subject: `Constancia de tu pedido de arrepentimiento (${code})`,
      title: "Recibimos tu pedido de arrepentimiento",
      html: `<p>Hola ${html.escape(body.name)},</p>
<p>Registramos tu solicitud de revocación sobre el pedido <strong>#${html.escape(body.orderNumber)}</strong>.</p>
<p>Código de identificación: <strong style="font-size:18px">${code}</strong></p>
<p>Guardá este correo como constancia. Nos vamos a comunicar con vos a esta dirección para informarte cómo sigue el trámite.</p>`
    });
    await sendEmail({
      to: config.SUPPORT_EMAIL,
      replyTo: body.email,
      subject: `[${code}] Botón de arrepentimiento · #${body.orderNumber}`,
      title: `Arrepentimiento ${code}`,
      html: `<p><strong>${html.escape(body.name)}</strong> &lt;${html.escape(body.email)}&gt; pidió revocar el pedido #${html.escape(body.orderNumber)} (${matches ? "coincide con el comprador" : "NO se pudo vincular a un pedido de esa persona: verificar"}).</p><p>${html.escape(body.message || "(sin comentario)").replace(/\n/g, "<br/>")}</p><p>La normativa exige confirmar la recepción dentro de las 24 hs: ${sent ? "la constancia ya se envió automáticamente" : "⚠️ NO se pudo enviar la constancia, respondele a mano"}.</p>`
    });
    void notifyDiscord(`↩️ Botón de arrepentimiento ${code} sobre #${body.orderNumber} (${body.name})${matches ? "" : " — pedido sin vincular, verificar"}`);
    if (!sent) {
      throw new HttpError(
        502,
        `Registramos tu solicitud con el código ${code}, pero no pudimos enviarte el email de constancia. Anotá el código y escribinos a ${config.SUPPORT_EMAIL}.`
      );
    }
    return { ok: true, code };
  });
}
