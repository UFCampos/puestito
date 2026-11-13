import { Resend } from "resend";
import { config } from "../config.js";

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f3ff;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #ede9fe">
    <p style="margin:0 0 12px;font-weight:800;color:#7c3aed">🎪 TuPuestito</p>
    <h1 style="font-size:20px;margin:0 0 12px;color:#0f172a">${escapeHtml(title)}</h1>
    <div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
    ${
      cta
        ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="background:#7c3aed;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">${escapeHtml(cta.label)}</a></p>`
        : ""
    }
  </div>
  <p style="text-align:center;font-size:11px;color:#94a3b8;line-height:1.6">
    Recibiste este correo por tu actividad en TuPuestito.<br/>
    ¿Necesitás ayuda? <a href="${config.WEB_URL}/ayuda" style="color:#7c3aed">Centro de ayuda</a> ·
    <a href="mailto:${escapeHtml(config.SUPPORT_EMAIL)}" style="color:#7c3aed">${escapeHtml(config.SUPPORT_EMAIL)}</a>
  </p>
</body></html>`;
}

/** Envía un correo transaccional. Devuelve false si no se pudo entregar al proveedor. */
export async function sendEmail(params: {
  to: string;
  subject: string;
  title: string;
  html: string;
  cta?: { label: string; url: string };
  replyTo?: string;
}): Promise<boolean> {
  if (!resend) {
    console.info(`[email:dev] → ${params.to} | ${params.subject}${params.cta ? ` | ${params.cta.url}` : ""}`);
    return true;
  }
  try {
    const { error } = await resend.emails.send({
      from: config.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: layout(params.title, params.html, params.cta),
      ...(params.replyTo ? { replyTo: params.replyTo } : {})
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error enviando correo:", err);
    return false;
  }
}

/** Webhook de Discord para el canal interno de operaciones (Plan Sprint 6) */
export async function notifyDiscord(content: string) {
  if (!config.DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(config.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (err) {
    console.error("[discord] Error enviando webhook:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// Alertas de errores al canal de operaciones
// ─────────────────────────────────────────────────────────────
const ALERT_WINDOW_MS = 10 * 60_000;
const recentAlerts = new Map<string, { at: number; repeats: number }>();

/**
 * Avisa de un error al canal de operaciones. El mismo error (misma `key`) se informa una sola vez
 * cada 10 minutos, con el contador de repeticiones, para que una falla en cadena no inunde el canal.
 */
export function alertOps(key: string, message: string) {
  const now = Date.now();
  const previous = recentAlerts.get(key);
  if (previous && now - previous.at < ALERT_WINDOW_MS) {
    previous.repeats += 1;
    return;
  }
  const repeats = previous?.repeats ?? 0;
  recentAlerts.set(key, { at: now, repeats: 0 });
  if (recentAlerts.size > 500) {
    for (const [k, v] of recentAlerts) if (now - v.at > ALERT_WINDOW_MS) recentAlerts.delete(k);
  }
  void notifyDiscord(`🚨 ${message}${repeats > 0 ? ` (se repitió ${repeats} veces más en los últimos minutos)` : ""}`);
}

export const html = { escape: escapeHtml };
