import crypto from "node:crypto";

export interface CreatePreferenceParams {
  orderId: string;
  orderNumber: string;
  title: string;
  unitPriceArs: number;
  marketplaceFeeArs: number;
  artistAccessToken: string;
  notificationUrl: string;
}

export interface MPPreferenceResult {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
}

export class MercadoPagoService {
  /**
   * Cifra o descifra tokens de Mercado Pago usando AES-256-GCM
   */
  private static getEncryptionKey(): Buffer {
    const rawKey = process.env.ENCRYPTION_KEY || "tupuestito_super_secret_master_key_32bytes!!";
    return crypto.scryptSync(rawKey, "salt_tupuestito", 32);
  }

  static encryptToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getEncryptionKey(), iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  static decryptToken(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Crea una preferencia de pago en Mercado Pago usando el access_token del artista y cobrando el marketplace_fee
   * Si no hay token real o estamos en modo mock/sandbox local, retorna una URL de checkout simulada de TuPuestito
   */
  static async createSplitPreference(params: CreatePreferenceParams): Promise<MPPreferenceResult> {
    // Si tenemos credenciales reales de Mercado Pago
    if (params.artistAccessToken && params.artistAccessToken.startsWith("APP_USR-")) {
      try {
        const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.artistAccessToken}`
          },
          body: JSON.stringify({
            items: [
              {
                id: params.orderId,
                title: params.title, // Concepto neutro seguro: "Encargo de ilustración #PST-..."
                quantity: 1,
                unit_price: params.unitPriceArs,
                currency_id: "ARS"
              }
            ],
            marketplace_fee: params.marketplaceFeeArs,
            external_reference: params.orderId,
            notification_url: params.notificationUrl,
            back_urls: {
              success: "http://localhost:3000/orders/" + params.orderId + "?payment=success",
              failure: "http://localhost:3000/orders/" + params.orderId + "?payment=failure",
              pending: "http://localhost:3000/orders/" + params.orderId + "?payment=pending"
            },
            auto_return: "approved"
          })
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          return {
            id: data.id,
            initPoint: data.init_point,
            sandboxInitPoint: data.sandbox_init_point
          };
        }
      } catch (err) {
        console.warn("Fallo llamada a MP API, usando simulador de pago local:", err);
      }
    }

    // Modo Mock/Sandbox para testear localmente sin token real de MP
    const mockPrefId = `mock_pref_${crypto.randomUUID()}`;
    return {
      id: mockPrefId,
      initPoint: `http://localhost:4000/api/payments/mock-checkout?pref_id=${mockPrefId}&order_id=${params.orderId}`,
      sandboxInitPoint: `http://localhost:4000/api/payments/mock-checkout?pref_id=${mockPrefId}&order_id=${params.orderId}`
    };
  }
}

