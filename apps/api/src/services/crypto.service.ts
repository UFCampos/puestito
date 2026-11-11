import crypto from "node:crypto";
import { config } from "../config.js";

function loadKey(raw: string): Buffer {
  const trimmed = raw.trim();
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) key = Buffer.from(trimmed, "hex");
  else {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) key = b64;
  }
  if (!key || key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY debe ser de 32 bytes en hex (64 caracteres) o base64 (openssl rand -base64 32)"
    );
  }
  return key;
}

const KEY = loadKey(config.ENCRYPTION_KEY);

/** Cifrado AES-256-GCM: `v1:iv:authTag:ciphertext` (base64url) */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, encB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encB64) {
    throw new Error("Formato de secreto cifrado inválido");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

/** Firma HMAC-SHA256 con la clave del servidor (para `state` OAuth y URLs locales firmadas) */
export function hmac(data: string): string {
  return crypto.createHmac("sha256", KEY).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
