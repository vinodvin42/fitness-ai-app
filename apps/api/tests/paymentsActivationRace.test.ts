import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { env } from "../src/config/env";
import { verifyPayment, handleWebhook } from "../src/modules/payments/payments.service";

/**
 * Regression test for a real concurrency bug in payments.service.ts's
 * activatePayment(): the client's own POST /payments/razorpay/verify call
 * and Razorpay's independent POST /payments/razorpay/webhook call both
 * funnel through activatePayment() for the same Payment, and in real usage
 * commonly arrive within milliseconds of each other. The old guard
 * (`if (payment.status === "paid") return {}` followed by an unconditional
 * `prisma.payment.update(...)`) read each caller's own already-fetched,
 * possibly-stale Payment snapshot — so two concurrent calls could both
 * pass the guard and both proceed to call subscribe() for the same
 * payment. subscribe() has no uniqueness guard of its own (unlike
 * purchaseProgram(), which checks a real userId_programId unique
 * constraint first), so this produced two simultaneously-"active"
 * Subscription rows for one user from a single Razorpay payment.
 *
 * Fixed by making the paid-status transition itself atomic
 * (`updateMany` with a `status: { not: "paid" }` filter, proceeding only
 * when the call's own update actually affected a row). This test drives
 * verifyPayment() and handleWebhook() concurrently against one Payment row
 * and asserts exactly one Subscription is created.
 *
 * Razorpay is deliberately unconfigured everywhere else in this suite (see
 * parkedPayments.test.ts's own doc comment) — this file is the one place
 * that temporarily sets env.RAZORPAY_* directly (env.ts exports a plain,
 * mutable object read live at call time, not destructured at import time)
 * so verifyPayment()/handleWebhook() run their real signature-verification
 * path, restoring the previous values in afterAll.
 */
describe("Payment activation race: concurrent /verify + webhook must not double-activate", () => {
  let userId: string;
  let planId: string;
  let providerOrderId: string;
  let previousKeyId: string | undefined;
  let previousKeySecret: string | undefined;
  let previousWebhookSecret: string | undefined;

  beforeAll(async () => {
    previousKeyId = env.RAZORPAY_KEY_ID;
    previousKeySecret = env.RAZORPAY_KEY_SECRET;
    previousWebhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_race_fixture";
    env.RAZORPAY_KEY_SECRET = "race-test-key-secret";
    env.RAZORPAY_WEBHOOK_SECRET = "race-test-webhook-secret";

    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("payments-race"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Payments Race Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    planId = `test-plan-race-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Race Test Pro Plan", priceCents: 1499, billingCycle: "monthly", isActive: true },
    });

    providerOrderId = `order_race_${suffix}`;
    await prisma.payment.create({
      data: {
        userId,
        purpose: "subscription",
        referenceId: planId,
        amountCents: 1499,
        currency: "INR",
        providerOrderId,
        status: "created",
      },
    });
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previousKeyId;
    env.RAZORPAY_KEY_SECRET = previousKeySecret;
    env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;

    await prisma.invoice.deleteMany({ where: { payment: { userId } } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("activates exactly once when /verify and the webhook race for the same payment", async () => {
    const razorpayPaymentId = `pay_race_${uniqueSuffix()}`;

    const verifySignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${providerOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    const webhookBody = Buffer.from(
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { order_id: providerOrderId, id: razorpayPaymentId } } },
      }),
    );
    const webhookSignature = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET!).update(webhookBody).digest("hex");

    // Fire both activation paths concurrently, exactly as a real client
    // callback and a real Razorpay webhook delivery can race in production.
    const results = await Promise.allSettled([
      verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature: verifySignature }),
      handleWebhook(webhookBody, webhookSignature),
    ]);

    // Neither path should throw — both are legitimate activation attempts,
    // the guard just makes the second one a no-op.
    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }

    const payment = await prisma.payment.findUnique({ where: { providerOrderId } });
    expect(payment?.status).toBe("paid");

    const subscriptions = await prisma.subscription.findMany({ where: { userId, planId } });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].status).toBe("active");
  });
});
