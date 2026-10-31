import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

export interface WatermarkOptions {
  mode: "MANUAL" | "AUTO_TEXT" | "AUTO_AVATAR";
  customText?: string;
  avatarUrl?: string;
}

export class WatermarkService {
  /**
   * Procesa una imagen para portfolio o entrega de boceto/preview
   * Genera un WebP optimizado y, si corresponde, le estampa marca de agua
   */
  static async processImage(
    inputBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 1200;

    if (options.mode === "MANUAL") {
      // Solo optimiza a WebP
      return await image
        .resize({ width: Math.min(width, 1600), withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    }

    // Modo AUTO_TEXT o AUTO_AVATAR: Crear overlay SVG repetido en diagonal
    const text = options.customText || "TuPuestito • MUESTRA NO AUTORIZADA";
    const patternWidth = 400;
    const patternHeight = 150;

    const svgOverlay = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wm-pattern" width="${patternWidth}" height="${patternHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
            <text x="20" y="80" 
                  font-family="sans-serif" 
                  font-size="20" 
                  font-weight="bold" 
                  fill="white" 
                  fill-opacity="0.28" 
                  stroke="black" 
                  stroke-width="0.5" 
                  stroke-opacity="0.3">
              ${text}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wm-pattern)" />
      </svg>
    `;

    return await image
      .resize({ width: Math.min(width, 1600), withoutEnlargement: true })
      .composite([
        {
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0
        }
      ])
      .webp({ quality: 85 })
      .toBuffer();
  }

  /**
   * Guarda un buffer procesado en la carpeta de uploads local y retorna la URL pública
   */
  static async saveUpload(buffer: Buffer, extension = "webp"): Promise<string> {
    const filename = `${crypto.randomUUID()}.${extension}`;
    const uploadDir = path.resolve(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    return `/uploads/${filename}`;
  }
}

