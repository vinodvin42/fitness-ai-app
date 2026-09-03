import crypto from "node:crypto";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import { getRazorpayClient, isRazorpayConfigured } from "../../lib/razorpayClient";
import { subscribe } from "../subscriptions/subscriptions.service";
import { purchaseProgram } from "../programPurchases/programPurchases.service";
import { ensureInvoiceForPayment } from "../adminFinance/adminFinance.service";
import { validateCoupon, recordRedemptionForPayment } from "../coupons/coupons.service";
import { CreateOrderInput } from "./payments.schema";

/**
 * Razorpay integration (20 Aug 2026), closing gap §14's "no payment
 * gateway" note for real, for both Subscription & Payments (§M) and
 * Programs Commerce (§I) — both now route through this one order/verify
 * flow rather than duplicating payment logic per feature:
 *
 *   1. Client calls POST /payments/razorpay/orders with what it wants to
 *      buy (a plan or a program) — createOrder() below resolves the real
 *      price server-side (never trusts a client-supplied amount), creates
 *      a Razorpay Order, and persists a Payment row with status "created".
 *   2. Client opens Razorpay's hosted Checkout (RazorpayCheckoutModal.tsx,
 *      a WebView — no native module linking needed) using the returned
 *      orderId/keyId.
 *   3. On success, the client calls POST /payments/razorpay/verify with
 *      Razorpay's signed response. verifyPayment() below recomputes the
 *      HMAC signature server-side and only THEN grants access — this is
 *      the actual security boundary; nothing before this point should be
 *      treated as "paid."
 *   4. Independently, Razorpay also calls POST /payments/razorpay/webhook
 *      (handleWebhook() below) — the async source of truth regardless of
 *      whether step 3 ever happens (e.g. the client crashes right after a
 *      successful charge but before it can report back). Both paths funnel
 *      through the same activatePayment() so a Payment can only ever be
 *      activated once.
 *
 * REAL CAVEAT this pass deliberately did not silently paper over: every
 * seeded priceCents value in this app was chosen and is displayed as USD
 * cents (`$14.99`) — see SubscriptionScreen.tsx, ProgramDetailScreen.tsx.
 * Razorpay's native currency is INR, and passing those same integers
 * through as-is with RAZORPAY_CURRENCY=INR would functionally undercharge
 * by roughly 80x (₹14.99 instead of a real ~₹1,200). This needs either
 * real INR list prices seeded, or a Razorpay account specifically
 * configured for international/USD settlement, before real money should
 * flow through it — see docs/mobile/07-open-questions-gaps.md.
 */

// Go-live hardening (25 Aug 2026) — both signature checks below used to
// compare with plain `!==`, which short-circuits on the first differing
// byte. That makes the comparison's runtime leak how many leading bytes
// of a guess were correct — the textbook timing side-channel that
// `crypto.timingSafeEqual` exists to close, and exactly why Razorpay's
// own SDK ships a constant-time `validateWebhookSignature` helper rather
// than telling integrators to use `===`. Guard the length check first:
// `timingSafeEqual` throws on mismatched buffer lengths rather than
// returning false, and a length mismatch here isn't a real signature
// either way, so there's no timing information worth protecting by
// routing it through the constant-time path too.
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function resolveAmountCents(
  input: CreateOrderInput,
): Promise<{ amountCents: number; description: string }> {
  if (input.purpose === "subscription") {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.referenceId } });
    if (!plan) throw new ApiHttpError(404, "plan_not_found", "Subscription plan not found");
    if (plan.priceCents === 0) {
      throw new ApiHttpError(400, "plan_is_free", "This plan is free — subscribe directly, no payment needed");
    }
    return { amountCents: plan.priceCents, description: `${plan.name} subscription (${plan.billingCycle})` };
  }

  const program = await prisma.program.findUnique({ where: { id: input.referenceId } });
  if (!program) throw new ApiHttpError(404, "program_not_found", "Program not found");
  if (program.priceCents === 0) {
    throw new ApiHttpError(400, "program_is_free", "This program is free — no payment needed");
  }
  return { amountCents: program.priceCents, description: `${program.name} program purchase` };
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  if (!isRazorpayConfigured()) {
    throw new ApiHttpError(
      503,
      "payment_gateway_not_configured",
      "Payments aren't configured on this server yet — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET",
    );
  }

  const { amountCents: listAmountCents, description } = await resolveAmountCents(input);

  // Module 06.05 Coupons (31 Aug 2026) — apply an optional discount code
  // against the real list price. Validation is server-side; an invalid code
  // fails the order (422) rather than quietly charging full price. The
  // redemption is NOT recorded here — only once the payment is captured
  // (see activatePayment → recordRedemptionForPayment), so an abandoned
  // checkout never burns the user's one allowed redemption.
  let amountCents = listAmountCents;
  let couponCode: string | null = null;
  let discountCents: number | null = null;
  if (input.couponCode) {
    const result = await validateCoupon(userId, input.couponCode, listAmountCents);
    if (!result.valid) {
      throw new ApiHttpError(422, "coupon_invalid", result.reason);
    }
    amountCents = result.finalCents;
    couponCode = result.code;
    discountCents = result.discountCents;
  }

  const razorpay = getRazorpayClient();

  const order = await razorpay.orders.create({
    amount: amountCents,
    currency: env.RAZORPAY_CURRENCY,
    receipt: `${input.purpose}_${input.referenceId}_${Date.now()}`,
    notes: { userId, purpose: input.purpose, referenceId: input.referenceId },
  });

  const payment = await prisma.payment.create({
    data: {
      userId,
      purpose: input.purpose,
      referenceId: input.referenceId,
      amountCents,
      currency: env.RAZORPAY_CURRENCY,
      providerOrderId: order.id,
      status: "created",
      couponCode,
      discountCents,
    },
  });

  await recordAudit({
    actorId: userId,
    action: "payment.order_created",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { purpose: input.purpose, referenceId: input.referenceId, amountCents, razorpayOrderId: order.id },
  });

  return {
    orderId: order.id,
    amountCents,
    currency: env.RAZORPAY_CURRENCY,
    keyId: env.RAZORPAY_KEY_ID,
    name: "23PrimeFit",
    description,
    couponCode,
    discountCents,
  };
}

interface PaymentRecord {
  id: string;
  userId: string;
  purpose: "subscription" | "program_purchase";
  referenceId: string;
  status: "created" | "paid" | "failed";
}

/**
 * Shared by both the client's /verify call and the webhook — whichever
 * reaches here first wins; the other is a no-op. Reuses the exact same
 * subscribe()/purchaseProgram() functions the old direct-activate flow
 * used, just now gated behind `verifiedPayment: true`, which those
 * functions require for any non-free plan/program (see their own doc
 * comments).
 */
async function activatePayment(payment: PaymentRecord) {
  if (payment.status === "paid") return; // already activated — don't double-grant

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "paid" } });

  if (payment.purpose === "subscription") {
    await subscribe(payment.userId, { planId: payment.referenceId }, { verifiedPayment: true });
  } else {
    await purchaseProgram(payment.userId, payment.referenceId, { verifiedPayment: true });
  }

  await recordAudit({
    actorId: payment.userId,
    action: "payment.captured",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { purpose: payment.purpose, referenceId: payment.referenceId },
  });

  // Module 06.05 Coupons (31 Aug 2026) — record the coupon redemption now
  // that the payment is genuinely captured (idempotent, no-op if no coupon
  // was applied). See coupons.service.ts's recordRedemptionForPayment.
  await recordRedemptionForPayment(payment.id);

  // Module 10 Finance, added 26 Aug 2026 — the "one ledger" architecture
  // decision's real trigger point (reports/finance-architecture-plan.html):
  // every Payment that reaches "paid" gets exactly one Invoice, generated
  // here rather than through any separate manual flow. Idempotent on its
  // own, but this is the single choke point both the /verify call and the
  // webhook funnel through either way (this function's own guard above).
  await ensureInvoiceForPayment(payment.id);
}

export async function verifyPayment(
  userId: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
) {
  if (!isRazorpayConfigured()) {
    throw new ApiHttpError(503, "payment_gateway_not_configured", "Payments aren't configured on this server yet");
  }

  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.razorpayOrderId } });
  if (!payment || payment.userId !== userId) {
    throw new ApiHttpError(404, "payment_not_found", "No matching payment order found for this user");
  }

  if (payment.status === "paid") {
    return { verified: true, purpose: payment.purpose, referenceId: payment.referenceId };
  }

  // The actual security boundary — recompute the signature server-side
  // with the secret key, never trust that a client posting "success" means
  // it really was one.
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  if (!timingSafeEqualHex(expectedSignature, input.razorpaySignature)) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    throw new ApiHttpError(400, "invalid_signature", "Payment signature verification failed");
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: input.razorpayPaymentId } });
  await activatePayment(payment);

  return { verified: true, purpose: payment.purpose, referenceId: payment.referenceId };
}

/**
 * Razorpay webhook — the async source of truth independent of whether the
 * client's own /verify call ever completes. `rawBody` must be the exact
 * unparsed request body: Razorpay's webhook signature is computed over
 * raw bytes, not the reserialized JSON object express.json() would
 * produce — see payments.routes.ts for why this one route is mounted
 * with express.raw() instead of the app's usual express.json().
 */
export async function handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiHttpError(503, "webhook_not_configured", "RAZORPAY_WEBHOOK_SECRET is not set");
  }
  if (!signatureHeader) {
    throw new ApiHttpError(400, "missing_signature", "Missing X-Razorpay-Signature header");
  }

  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (!timingSafeEqualHex(expected, signatureHeader)) {
    throw new ApiHttpError(400, "invalid_webhook_signature", "Webhook signature verification failed");
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const orderId: string | undefined = event?.payload?.payment?.entity?.order_id;
  const paymentId: string | undefined = event?.payload?.payment?.entity?.id;

  if (!orderId) return; // an event type this app doesn't key off an order — nothing to do

  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment) return; // not an order from this app (or already cleaned up) — ignore, this is a webhook, not a client request

  if (event.event === "payment.captured") {
    if (paymentId && !payment.providerPaymentId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: paymentId } });
    }
    await activatePayment(payment);
  } else if (event.event === "payment.failed" && payment.status === "created") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  }
}
