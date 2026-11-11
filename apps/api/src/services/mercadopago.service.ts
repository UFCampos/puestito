import crypto from "node:crypto";
import { config } from "../config.js";
import { safeEqual } from "./crypto.service.js";

const MP_API = "https://api.mercadopago.com";

export interface MpOAuthToken {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id: number | string;
  expires_in?: number;
  live_mode?: boolean;
  scope?: string;
}

export interface MpPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

export interface MpPayment {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved?: string | null;
  collector_id?: number;
  marketplace_fee?: number;
}

export class MercadoPagoError extends Error {
  constructor(message: string, public status?: number, public details?: unknown) {
    super(message);
  }
}

async function mpFetch<T>(pathname: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>)
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${MP_API}${pathname}`, { ...init, headers, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new MercadoPagoError(
      `Mercado Pago respondió ${res.status} en ${pathname}: ${data?.message ?? text.slice(0, 200)}`,
      res.status,
      data
    );
  }
  return data as T;
}

export const MercadoPagoService = {
  redirectUri(): string {
    return `${config.API_URL}/api/payments/mp/callback`;
  },

  /** URL de autorización OAuth (Plan Sprint 5: vinculación de la cuenta del artista) */
  authorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL(config.MP_AUTH_URL);
    url.searchParams.set("client_id", config.MP_CLIENT_ID ?? "");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async exchangeCode(code: string, codeVerifier: string): Promise<MpOAuthToken> {
    return mpFetch<MpOAuthToken>("/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        client_id: config.MP_CLIENT_ID,
        client_secret: config.MP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(),
        code_verifier: codeVerifier
      })
    });
  },

  async refreshToken(refreshToken: string): Promise<MpOAuthToken> {
    return mpFetch<MpOAuthToken>("/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        client_id: config.MP_CLIENT_ID,
        client_secret: config.MP_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    });
  },

  /**
   * Checkout Pro con split: el cobro se crea con el access_token DEL ARTISTA (el dinero va
   * directo a su cuenta) y `marketplace_fee` es la comisión de TuPuestito.
   * El concepto siempre es neutro (Plan §2).
   */
  async createPreference(params: {
    sellerAccessToken: string;
    milestoneId: string;
    orderId: string;
    title: string;
    amountArs: number;
    marketplaceFeeArs: number;
    payerEmail?: string;
    expiresAt?: Date;
  }): Promise<MpPreference> {
    const back = (result: string) => `${config.WEB_URL}/orders/${params.orderId}?payment=${result}`;
    return mpFetch<MpPreference>("/checkout/preferences", {
      method: "POST",
      token: params.sellerAccessToken,
      headers: { "X-Idempotency-Key": params.milestoneId },
      body: JSON.stringify({
        items: [
          {
            id: params.milestoneId,
            title: params.title,
            category_id: "services",
            quantity: 1,
            unit_price: params.amountArs,
            currency_id: "ARS"
          }
        ],
        payer: params.payerEmail ? { email: params.payerEmail } : undefined,
        marketplace_fee: params.marketplaceFeeArs,
        external_reference: params.milestoneId,
        notification_url: `${config.API_URL}/api/payments/webhook?source_news=webhooks`,
        back_urls: { success: back("success"), failure: back("failure"), pending: back("pending") },
        auto_return: "approved",
        statement_descriptor: "TUPUESTITO",
        binary_mode: true,
        ...(params.expiresAt
          ? { expires: true, expiration_date_to: params.expiresAt.toISOString() }
          : {})
      })
    });
  },

  async getPayment(paymentId: string, sellerAccessToken: string): Promise<MpPayment> {
    if (!/^\d+$/.test(paymentId)) throw new MercadoPagoError("payment_id inválido", 400);
    return mpFetch<MpPayment>(`/v1/payments/${paymentId}`, { token: sellerAccessToken });
  },

  /**
   * Valida el header `x-signature` de las notificaciones Webhook.
   * manifest = `id:{data.id};request-id:{x-request-id};ts:{ts};`
   */
  verifyWebhookSignature(params: {
    signatureHeader?: string;
    requestId?: string;
    dataId?: string;
  }): boolean {
    if (!config.MP_WEBHOOK_SECRET || !params.signatureHeader) return false;
    const parts = Object.fromEntries(
      params.signatureHeader.split(",").map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k, v.join("=")];
      })
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    // Rechazar notificaciones viejas (anti-replay, 10 min)
    const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;

    let manifest = "";
    if (params.dataId) {
      const id = /^[a-zA-Z0-9]+$/.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
      manifest += `id:${id};`;
    }
    if (params.requestId) manifest += `request-id:${params.requestId};`;
    manifest += `ts:${ts};`;

    const expected = crypto.createHmac("sha256", config.MP_WEBHOOK_SECRET).update(manifest).digest("hex");
    return safeEqual(expected, v1);
  }
};

/** PKCE helpers */
export function pkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
