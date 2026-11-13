/**
 * Tests unitarios de la lógica de dinero, plazos y seguridad (sin base de datos).
 *   pnpm --filter @tupuestito/api test:unit
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// config.ts lee el entorno al importarse: lo fijamos antes de cargar los módulos
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
process.env.PLATFORM_FEE_PERCENT = "5";
process.env.POST_DELIVERY_DISPUTE_DAYS = "7";

const order = await import("./services/order.service.js");
const { canOpenDispute } = await import("./services/dispute.service.js");
const { MercadoPagoService } = await import("./services/mercadopago.service.js");
const { encryptSecret, decryptSecret } = await import("./services/crypto.service.js");
const { sniffArchive } = await import("./lib/limits.js");
const { pool } = await import("./db/index.js");

after(() => pool.end());

const DAY = 86_400_000;

describe("montos y comisión", () => {
  it("pago único: todo al inicio", () => {
    assert.deepEqual(order.computeAmounts("FULL_100", 10_001), { platformFeeAmount: 500, depositAmount: 10_001, finalAmount: 0 });
  });

  it("50/50: las dos mitades suman el total aunque sea impar", () => {
    const a = order.computeAmounts("SPLIT_ON_SKETCH", 10_001);
    assert.equal(a.depositAmount + a.finalAmount, 10_001);
  });

  it("etapas: la última absorbe el redondeo", () => {
    const ms = order.buildOrderMilestones(
      [33, 33, 34].map((percent, i) => ({ title: `e${i}`, description: "", percent, days: 1 })),
      100_001
    );
    assert.equal(ms.reduce((acc, m) => acc + m.amount, 0), 100_001);
  });

  it("etapas: la suma de comisiones por etapa es exactamente la comisión total", () => {
    for (const total of [999, 10_001, 33_333, 150_007]) {
      const ms = order.buildOrderMilestones(
        [17, 29, 31, 23].map((percent, i) => ({ title: `e${i}`, description: "", percent, days: 1 })),
        total
      );
      const { platformFeeAmount } = order.computeAmounts("MILESTONES", total, ms);
      const fees = ms.map((_, i) => order.milestoneStageFee({ milestonesSnapshot: ms, platformFeeAmount }, i));
      assert.equal(fees.reduce((a, b) => a + b, 0), platformFeeAmount, `total ${total}`);
    }
  });

  it("50/50: seña + saldo cobran exactamente la comisión total", () => {
    const base = { paymentPlanSnapshot: "SPLIT_ON_FINAL_PREVIEW" as const, milestonesSnapshot: [], currentMilestone: 0, ...order.computeAmounts("SPLIT_ON_FINAL_PREVIEW", 12_345) };
    const first = order.pendingPayment({ ...base, status: "ACCEPTED_WAITING_DEPOSIT" })!;
    const second = order.pendingPayment({ ...base, status: "WAITING_PAYMENT_BEFORE_HD" })!;
    assert.equal(first.amount + second.amount, 12_345);
    assert.equal(first.fee + second.fee, base.platformFeeAmount);
  });

  it("no hay pago pendiente mientras el artista trabaja o en un reclamo", () => {
    const base = { paymentPlanSnapshot: "FULL_100" as const, milestonesSnapshot: [], currentMilestone: 0, ...order.computeAmounts("FULL_100", 1000) };
    assert.equal(order.pendingPayment({ ...base, status: "IN_PROGRESS_SKETCH" }), null);
    assert.equal(order.pendingPayment({ ...base, status: "DISPUTED" }), null);
  });
});

describe("plazos", () => {
  const now = Date.now();
  const at = (status: string, extra = {}) =>
    order.orderDeadlines({ status: status as any, statusChangedAt: new Date(now), acceptedAt: null, workDueAt: null, completedAt: null, ...extra });

  it("cada estado expone solo su plazo", () => {
    assert.ok(at("REQUESTED").requestExpiresAt);
    assert.ok(at("SKETCH_REVIEW").reviewAutoApproveAt);
    assert.ok(at("MILESTONE_WAITING_PAYMENT").paymentTimeoutAt);
    assert.equal(at("SKETCH_REVIEW").paymentTimeoutAt, null);
    assert.equal(at("DISPUTED").reviewAutoApproveAt, null);
  });

  it("la entrega estimada solo se muestra mientras trabaja el artista", () => {
    const due = new Date(now + DAY);
    assert.equal(at("WORKING_FINAL", { workDueAt: due }).workDueAt, due);
    assert.equal(at("SKETCH_REVIEW", { workDueAt: due }).workDueAt, null);
  });

  it("reclamos: con pagos en curso sí, antes de pagar no, y la ventana post-entrega vence", () => {
    assert.equal(canOpenDispute({ status: "WORKING_FINAL", completedAt: null }, "ARTIST"), true);
    assert.equal(canOpenDispute({ status: "ACCEPTED_WAITING_DEPOSIT", completedAt: null }, "BUYER"), false);
    const done = { status: "COMPLETED_HD_UNLOCKED" as const, completedAt: new Date(now - 3 * DAY) };
    assert.equal(canOpenDispute(done, "BUYER"), true);
    assert.equal(canOpenDispute(done, "ARTIST"), false);
    assert.equal(canOpenDispute({ ...done, completedAt: new Date(now - 8 * DAY) }, "BUYER"), false);
  });
});

describe("firma de webhooks de Mercado Pago", () => {
  const sign = (dataId: string, requestId: string, ts: string) =>
    crypto.createHmac("sha256", "secreto-de-prueba").update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  const check = (ts: string, v1?: string) =>
    MercadoPagoService.verifyWebhookSignature({ signatureHeader: `ts=${ts},v1=${v1 ?? sign("123", "req-1", ts)}`, requestId: "req-1", dataId: "123" });

  it("acepta una firma válida (segundos y milisegundos)", () => {
    assert.equal(check(String(Math.floor(Date.now() / 1000))), true);
    assert.equal(check(String(Date.now())), true);
  });
  it("rechaza firmas alteradas, sin encabezado o demasiado viejas", () => {
    assert.equal(check(String(Math.floor(Date.now() / 1000)), "0".repeat(64)), false);
    assert.equal(MercadoPagoService.verifyWebhookSignature({ requestId: "req-1", dataId: "123" }), false);
    assert.equal(check(String(Math.floor((Date.now() - 6 * DAY) / 1000))), false);
  });
});

describe("cifrado de tokens", () => {
  it("ida y vuelta", () => {
    assert.equal(decryptSecret(encryptSecret("APP_USR-123")), "APP_USR-123");
  });
  it("detecta un texto cifrado alterado", () => {
    const enc = encryptSecret("APP_USR-123").split(":");
    enc[3] = Buffer.from("otra cosa").toString("base64url");
    assert.throws(() => decryptSecret(enc.join(":")));
  });
});

describe("formatos de entrega", () => {
  it("reconoce zip, rar y psd por sus bytes", () => {
    assert.equal(sniffArchive(Buffer.from([0x50, 0x4b, 0x03, 0x04])), "zip");
    assert.equal(sniffArchive(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01])), "rar");
    assert.equal(sniffArchive(Buffer.from("8BPS")), "psd");
    assert.equal(sniffArchive(Buffer.from("hola mundo")), null);
  });
});
