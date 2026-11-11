import { config } from "../config.js";

const MB = 1024 * 1024;

/**
 * Límites de tamaño por tipo de archivo subido (en bytes).
 * Las referencias quedan fijas en 5 MB (Plan §6); el resto se ajusta por variables de entorno.
 */
export const LIMITS = {
  referenceBytes: 5 * MB,
  avatarBytes: config.MAX_AVATAR_MB * MB,
  portfolioBytes: config.MAX_PORTFOLIO_MB * MB,
  sketchBytes: config.MAX_SKETCH_MB * MB,
  finalPreviewBytes: config.MAX_SKETCH_MB * MB,
  finalDeliveryBytes: config.MAX_FINAL_DELIVERY_MB * MB
} as const;

/** Mismos límites en MB, para mostrarlos en el frontend y en mensajes de error */
export const LIMITS_MB = {
  reference: 5,
  avatar: config.MAX_AVATAR_MB,
  portfolio: config.MAX_PORTFOLIO_MB,
  sketch: config.MAX_SKETCH_MB,
  finalPreview: config.MAX_SKETCH_MB,
  finalDelivery: config.MAX_FINAL_DELIVERY_MB
} as const;

/** Formatos aceptados para la entrega final (se valida la firma del archivo, no la extensión) */
export type DeliveryKind = "image" | "zip" | "rar" | "psd";

export const DELIVERY_FORMATS: Record<Exclude<DeliveryKind, "image">, { ext: string; contentType: string }> = {
  zip: { ext: "zip", contentType: "application/zip" },
  rar: { ext: "rar", contentType: "application/vnd.rar" },
  psd: { ext: "psd", contentType: "image/vnd.adobe.photoshop" }
};

/** Detecta ZIP / RAR / PSD por sus bytes iniciales */
export function sniffArchive(head: Buffer): Exclude<DeliveryKind, "image"> | null {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05) && (head[3] === 0x04 || head[3] === 0x06)) return "zip";
  if (head.length >= 7 && head.subarray(0, 6).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]))) return "rar";
  if (head.length >= 4 && head.subarray(0, 4).toString("latin1") === "8BPS") return "psd";
  return null;
}
