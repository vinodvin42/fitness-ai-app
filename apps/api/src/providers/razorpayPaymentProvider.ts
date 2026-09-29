import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../config/env";
import type { CreateOrderInput, PaymentProvider, ProviderOrder, ProviderRefund, VerifySignatureInput } from "./types";

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
};
