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
  <p style="text-align:center;font-size:11px;color:#94a3b8">Recibiste este correo por tu actividad en TuPuestito.</p>
</body></html>`;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  title: string;
  html: string;
  cta?: { label: string; url: string };
}) {
  if (!resend) {
    console.info(`[email:dev] → ${params.to} | ${params.subject}${params.cta ? ` | ${params.cta.url}` : ""}`);
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: config.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: layout(params.title, params.html, params.cta)
    });
    if (error) console.error("[email] Resend error:", error);
  } catch (err) {
    console.error("[email] Error enviando correo:", err);
  }
}

/** Webhook de Discord para el canal interno de operaciones (Plan Sprint 6) */
export async function notifyDiscord(content: string) {
  if (!config.DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(config.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } })
    });
  } catch (err) {
    console.error("[discord] Error enviando webhook:", err);
  }
}

export const html = { escape: escapeHtml };
