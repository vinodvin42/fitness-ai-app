import Razorpay from "razorpay";
import { env } from "../config/env";

/**
 * Razorpay SDK wrapper (20 Aug 2026, gap §14). Deliberately lazy — the
 * client is only constructed the first time a route actually needs it,
 * not at module-import time. `apps/api`'s own README documents a real
 * lesson from this build: eagerly instantiating a client at import time
 * (Prisma's `new PrismaClient()`) means an unconfigured/unreachable
 * dependency breaks every route that transitively imports the module,
 * not just the ones that use it. Razorpay is a bolt-on feature — an
 * unconfigured merchant account should mean "payment routes 503", not
 * "the whole API won't boot."
 */

let client: Razorpay | null = null;

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (see .env.example)",
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
  }
  return client;
}
