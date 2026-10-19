import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../config/env";
import type {
  CreateOrderInput,
  ListSettlementsInput,
  PaymentProvider,
  ProviderOrder,
  ProviderRefund,
  ProviderSettlement,
  VerifySignatureInput,
} from "./types";

/**
 * D4's real implementation. This is the same lazy-construction and
 * "unconfigured means 503, not a boot failure" behaviour
 * `lib/razorpayClient.ts` already had — that file's own doc comment
 * records the lesson (eagerly instantiating a client at import time
 * breaks every route that transitively imports the module). The only
 * change is that it now sits behind the interface, so the choice of
 * provider is a config value rather than an import.
 */
let client: Razorpay | null = null;

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const razorpayPaymentProvider: PaymentProvider = {
  name: "razorpay",

  isConfigured() {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  },

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    if (!client) {
      if (!this.isConfigured()) {
        throw new Error("Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
      }
      client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
    }
    const order = await client.orders.create({
      amount: input.amountCents,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    });
    return { id: order.id };
  },

  verifySignature(input: VerifySignatureInput): boolean {
    if (!env.RAZORPAY_KEY_SECRET) return false;
    // The actual security boundary — recompute server-side with the
    // secret, never trust that a client posting "success" means it was.
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, input.signature);
  },

  async refund(providerPaymentId: string, amountCents: number): Promise<ProviderRefund> {
    if (!client) {
      if (!this.isConfigured()) throw new Error("Razorpay is not configured");
      client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
    }
    const refund = await client.payments.refund(providerPaymentId, { amount: amountCents });
    return { id: (refund as { id?: string }).id ?? null };
  },

  // 10.09 Bank Settlements (Oct 2026). The SDK's settlements.all() calls
  // GET /v1/settlements (regular settlements, not on-demand ones). Its
  // TypeScript types describe instant settlements, so the documented
  // fields are read defensively here.
  async listSettlements(input: ListSettlementsInput): Promise<ProviderSettlement[]> {
    if (!client) {
      if (!this.isConfigured()) throw new Error("Razorpay is not configured");
      client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
    }
    const res = await client.settlements.all({
      from: Math.floor(input.from.getTime() / 1000),
      to: Math.floor(input.to.getTime() / 1000),
      count: input.count,
      skip: input.skip,
    });
    return (res.items as unknown as RazorpaySettlementItem[]).map((s) => ({
      id: s.id,
      amountCents: s.amount ?? 0,
      feesCents: s.fees ?? 0,
      taxCents: s.tax ?? 0,
      utr: s.utr ?? null,
      status: s.status,
      createdAt: new Date(s.created_at * 1000),
    }));
  },
};

type RazorpaySettlementItem = {
  id: string;
  amount?: number;
  fees?: number;
  tax?: number;
  utr?: string | null;
  status: string;
  created_at: number;
};
