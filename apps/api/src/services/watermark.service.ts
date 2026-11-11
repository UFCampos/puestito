import sharp from "sharp";

export type WatermarkMode = "MANUAL" | "AUTO_TEXT" | "AUTO_AVATAR";

export interface WatermarkOptions {
  mode: WatermarkMode;
  /** @username del artista (sin @) */
  username: string;
  /** Texto personalizado opcional (watermark_custom_text) */
  customText?: string | null;
  /** Imagen del avatar (para AUTO_AVATAR) */
  avatar?: Buffer | null;
  /** Ancho máximo del resultado (vista previa en baja resolución) */
  maxWidth?: number;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

export class WatermarkService {
  /** Valida que el buffer sea una imagen que sharp pueda leer */
  static async assertImage(input: Buffer | string): Promise<void> {
    const meta = await sharp(input).metadata().catch(() => null);
    if (!meta?.width || !meta.height || !["png", "jpeg", "webp", "gif", "avif", "tiff"].includes(meta.format ?? "")) {
      throw new Error("El archivo no es una imagen válida (PNG, JPG o WebP)");
    }
  }

  /** Solo optimiza a WebP (referencias, portfolio en modo MANUAL, avatares) */
  static async optimize(input: Buffer, maxWidth = 1600): Promise<Buffer> {
    return sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  }

  /**
   * Plan §3.A — Marca de agua:
   *  - MANUAL: solo convierte a WebP optimizado.
   *  - AUTO_TEXT: patrón SVG en diagonal (30°) repetido con `@username • MUESTRA TuPuestito - NO USAR`.
   *  - AUTO_AVATAR: sello con el avatar del artista + @username, en mosaico.
   */
  static async apply(input: Buffer | string, options: WatermarkOptions): Promise<Buffer> {
    const maxWidth = options.maxWidth ?? 1600;

    // 1. Redimensionar primero: el overlay se construye con las dimensiones finales.
    const base = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });

    if (options.mode === "MANUAL") {
      return sharp(base.data).webp({ quality: 85 }).toBuffer();
    }

    const { width, height } = base.info;
    const label = escapeXml(
      (options.customText?.trim() || `@${options.username} • MUESTRA TuPuestito - NO USAR`).slice(0, 80)
    );
    const fontSize = Math.max(14, Math.round(Math.min(width, height) / 32));
    const tileW = Math.round(fontSize * Math.max(label.length * 0.62, 12));
    const tileH = Math.round(fontSize * (options.mode === "AUTO_AVATAR" ? 7 : 5));

    let stamp: string;
    if (options.mode === "AUTO_AVATAR" && options.avatar) {
      const size = fontSize * 3;
      const circle = Buffer.from(
        `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
      );
      const avatarPng = await sharp(options.avatar)
        .resize(size, size, { fit: "cover" })
        .composite([{ input: circle, blend: "dest-in" }])
        .png()
        .toBuffer()
        .catch(() => null);
      stamp = avatarPng
        ? `<image x="0" y="0" width="${size}" height="${size}" opacity="0.5" href="data:image/png;base64,${avatarPng.toString("base64")}"/>
           <text x="0" y="${size + fontSize * 1.4}" font-family="sans-serif" font-size="${fontSize}" font-weight="700"
             fill="#fff" fill-opacity="0.45" stroke="#000" stroke-opacity="0.35" stroke-width="${fontSize / 16}">${label}</text>`
        : "";
    } else {
      stamp = "";
    }

    if (!stamp) {
      stamp = `<text x="0" y="${fontSize * 2}" font-family="sans-serif" font-size="${fontSize}" font-weight="700"
        fill="#fff" fill-opacity="0.42" stroke="#000" stroke-opacity="0.35" stroke-width="${fontSize / 16}">${label}</text>`;
    }

    // El patrón cubre el doble del lienzo y se rota 30° para que no se pueda recortar.
    const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          ${stamp}
        </pattern>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#wm)"/>
    </svg>`);

    return sharp(base.data)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .webp({ quality: 80 })
      .toBuffer();
  }
}
