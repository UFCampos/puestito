import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Cliente de Better Auth (sesión por cookie httpOnly; nada de tokens en localStorage) */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  plugins: [usernameClient()],
  fetchOptions: { credentials: "include" }
});

export const PLACEHOLDER_AVATAR =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23ede9fe'/><text x='32' y='42' font-size='28' text-anchor='middle'>🎨</text></svg>";

export function resolveImageUrl(url?: string | null): string {
  if (!url) return PLACEHOLDER_AVATAR;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return `${API_URL}${url}`;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers, credentials: "include" });

  if (!res.ok) {
    let errMsg = `Error HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
      else if (data.message) errMsg = data.message;
    } catch {
      // ignore
    }
    throw new ApiError(errMsg, res.status);
  }
  return res.json();
}

/** Sube un archivo directo al storage con la URL firmada que entrega la API */
export async function uploadReference(file: File): Promise<string> {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error(`"${file.name}" no es PNG, JPG ni WebP`);
  if (file.size > 5 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 5 MB`);
  const signed = await apiFetch<{ key: string; uploadUrl: string; headers: Record<string, string> }>(
    "/api/uploads/reference",
    { method: "POST", body: JSON.stringify({ contentType: file.type, size: file.size }) }
  );
  const res = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.headers, body: file });
  if (!res.ok) throw new Error(`No se pudo subir "${file.name}"`);
  return signed.key;
}

export const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Solicitud enviada",
  REJECTED: "Rechazado",
  ACCEPTED_WAITING_DEPOSIT: "Esperando pago inicial",
  EXPIRED: "Vencido",
  IN_PROGRESS_SKETCH: "Boceto en proceso",
  SKETCH_REVIEW: "Boceto en revisión",
  WAITING_PAYMENT_AFTER_SKETCH: "Esperando 2° pago",
  WORKING_FINAL: "Obra final en proceso",
  FINAL_PREVIEW_REVIEW: "Vista previa en revisión",
  WAITING_PAYMENT_BEFORE_HD: "Esperando pago final",
  COMPLETED_HD_UNLOCKED: "Completado",
  CANCELLED: "Cancelado"
};

export const PLAN_LABEL: Record<string, string> = {
  FULL_100: "100% al inicio",
  SPLIT_ON_SKETCH: "50% seña + 50% al aprobar el boceto",
  SPLIT_ON_FINAL_PREVIEW: "50% seña + 50% al aprobar la vista previa final"
};
