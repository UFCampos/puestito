import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { hmac, safeEqual } from "./crypto.service.js";

/**
 * Almacenamiento de archivos (Plan §1: Cloudflare R2).
 *
 * - Bucket PÚBLICO: portfolio, avatares y banners (servidos por R2_PUBLIC_URL / CDN).
 * - Bucket PRIVADO: todo lo del pedido (referencias, bocetos, vistas previas y el original HD).
 *   Nunca se exponen URLs públicas; solo URLs firmadas de vida corta a participantes del pedido.
 *
 * El driver "local" replica la misma semántica en disco para desarrollo sin R2.
 */
export type Visibility = "public" | "private";

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_REFERENCE_BYTES = 5 * 1024 * 1024; // Plan §6: máx. 5 MB c/u

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/zip": "zip",
  "image/vnd.adobe.photoshop": "psd"
};

export function extensionFor(contentType: string, fallback = "bin"): string {
  return EXT_BY_TYPE[contentType] ?? fallback;
}

export function newKey(prefix: string, ext: string): string {
  return `${prefix.replace(/\/+$/, "")}/${crypto.randomUUID()}.${ext}`;
}

/** Evita path traversal y keys con caracteres raros */
export function isSafeKey(key: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,300}$/.test(key) && !key.includes("..");
}

// ─────────────────────────────────────────────────────────────
// Driver R2 (S3 compatible)
// ─────────────────────────────────────────────────────────────
const s3 =
  config.STORAGE_DRIVER === "r2"
    ? new S3Client({
        region: "auto",
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID!,
          secretAccessKey: config.R2_SECRET_ACCESS_KEY!
        }
      })
    : null;

function bucketFor(visibility: Visibility): string {
  return visibility === "public" ? config.R2_PUBLIC_BUCKET! : config.R2_PRIVATE_BUCKET!;
}

// ─────────────────────────────────────────────────────────────
// Driver local
// ─────────────────────────────────────────────────────────────
const localRoot = path.resolve(process.cwd(), config.LOCAL_STORAGE_DIR);

function localPath(visibility: Visibility, key: string): string {
  if (!isSafeKey(key)) throw new Error("Key inválida");
  return path.join(localRoot, visibility, key);
}

function localSignature(action: "get" | "put", key: string, exp: number, extra = ""): string {
  return hmac(`${action}:${key}:${exp}:${extra}`);
}

export function verifyLocalSignature(
  action: "get" | "put",
  key: string,
  exp: number,
  sig: string,
  extra = ""
): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(localSignature(action, key, exp, extra), sig);
}

// ─────────────────────────────────────────────────────────────
// API pública del servicio
// ─────────────────────────────────────────────────────────────
export const storage = {
  async put(visibility: Visibility, key: string, body: Buffer, contentType: string) {
    if (s3) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketFor(visibility),
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store"
        })
      );
      return;
    }
    const file = localPath(visibility, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(`${file}.meta`, contentType);
  },

  async get(visibility: Visibility, key: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (s3) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucketFor(visibility), Key: key }));
        const bytes = await res.Body!.transformToByteArray();
        return { body: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" };
      } catch {
        return null;
      }
    }
    try {
      const file = localPath(visibility, key);
      const [body, contentType] = await Promise.all([
        fs.readFile(file),
        fs.readFile(`${file}.meta`, "utf8").catch(() => "application/octet-stream")
      ]);
      return { body, contentType };
    } catch {
      return null;
    }
  },

  async head(visibility: Visibility, key: string): Promise<{ size: number; contentType: string } | null> {
    if (s3) {
      try {
        const res = await s3.send(new HeadObjectCommand({ Bucket: bucketFor(visibility), Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
      } catch {
        return null;
      }
    }
    try {
      const file = localPath(visibility, key);
      const stat = await fs.stat(file);
      const contentType = await fs.readFile(`${file}.meta`, "utf8").catch(() => "");
      return { size: stat.size, contentType };
    } catch {
      return null;
    }
  },

  async delete(visibility: Visibility, key: string) {
    if (s3) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketFor(visibility), Key: key })).catch(() => {});
      return;
    }
    const file = localPath(visibility, key);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.meta`, { force: true });
  },

  /** URL pública permanente (solo bucket público) */
  publicUrl(key: string): string {
    if (s3) return `${config.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
    return `${config.API_URL}/files/public/${key}`;
  },

  /** URL firmada de lectura de vida corta (bucket privado) */
  async signedGetUrl(key: string, opts: { expiresIn?: number; downloadName?: string } = {}) {
    const expiresIn = opts.expiresIn ?? 60 * 15;
    if (s3) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucketFor("private"),
          Key: key,
          ResponseContentDisposition: opts.downloadName
            ? `attachment; filename="${opts.downloadName.replace(/["\\\r\n]/g, "")}"`
            : undefined
        }),
        { expiresIn }
      );
    }
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const dl = opts.downloadName ?? "";
    const sig = localSignature("get", key, exp, dl);
    const qs = new URLSearchParams({ exp: String(exp), sig, ...(dl ? { dl } : {}) });
    return `${config.API_URL}/files/private/${key}?${qs}`;
  },

  /**
   * URL firmada de subida directa desde el navegador (Plan §1: "Subida con Presigned URL").
   * Content-Type y Content-Length quedan firmados para que no puedan cambiarse.
   */
  async signedPutUrl(
    visibility: Visibility,
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn = 60 * 10
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const headers = { "Content-Type": contentType };
    if (s3) {
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucketFor(visibility),
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength
        }),
        { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) }
      );
      return { url, headers };
    }
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const extra = `${visibility}:${contentType}:${contentLength}`;
    const sig = localSignature("put", key, exp, extra);
    const qs = new URLSearchParams({
      exp: String(exp),
      sig,
      v: visibility,
      ct: contentType,
      len: String(contentLength)
    });
    return { url: `${config.API_URL}/files/upload/${key}?${qs}`, headers };
  }
};
