import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { env } from "../src/config/env";
import { verifyPayment, retryActivation, getPaymentForUser } from "../src/modules/payments/payments.service";
import { ApiHttpError } from "../src/middleware/errorHandler";

/**
 * Regression test for U6 Premium entitlement's real gap (§9 / BR-COM-011):
 * before this pass, activatePayment() (payments.service.ts) atomically
 * claimed `Payment.status: "paid"` and only THEN called subscribe() — if
 * that second step threw for any reason (a DB hiccup, a dropped
 * connection, or — as exercised here without any mocking — the thing it
 * references genuinely disappearing between order-creation and payment
 * capture), the Payment was left stuck at "paid" forever with no
 * Subscription ever created, and the old `status: { not: "paid" }` claim
 * filter permanently refused a retry. The client's own catch block then
 * sent the user to a flat "Payment Failed" screen — a lie, since Razorpay
 * really did capture the money.
 *
 * This test drives the real failure path (no vi.mock — deleting the
 * referenced SubscriptionPlan before verifyPayment() runs is a genuine,
 * naturally-occurring `plan_not_found` failure, not a simulated one),
 * confirms the new recoverable state (`activationFailedAt` +
 * `activationFailureReason`, a distinct `entitlement_activation_failed`
 * error code, and money that was captured staying captured), then confirms
 * `retryActivation()` genuinely finishes the grant once the underlying
 * problem is fixed — with no second charge. A final concurrency case
 * (mirroring paymentsActivationRace.test.ts's own style) proves two
 * concurrent retries of the same failed payment (a user's manual Retry tap
 * racing a Razorpay webhook redelivery, which funnels through the exact
 * same activatePayment()) still grant exactly one Subscription.
 *
 * Razorpay is deliberately unconfigured everywhere else in this suite (see
 * parkedPayments.test.ts's own doc comment) — this file, like
 * paymentsActivationRace.test.ts, temporarily sets env.RAZORPAY_* directly
 * so verifyPayment() runs its real signature-verification path, restoring
 * the previous values in afterAll.
 */
describe("Payment activation failure recovery: money captured, entitlement retried, never re-charged", () => {
  let userId: string;
  const paymentIds: string[] = [];
  let previousKeyId: string | undefined;
  let previousKeySecret: string | undefined;
  let previousWebhookSecret: string | undefined;

  beforeAll(async () => {
    previousKeyId = env.RAZORPAY_KEY_ID;
    previousKeySecret = env.RAZORPAY_KEY_SECRET;
    previousWebhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_activation_recovery_fixture";
    env.RAZORPAY_KEY_SECRET = "activation-recovery-test-key-secret";
    env.RAZORPAY_WEBHOOK_SECRET = "activation-recovery-test-webhook-secret";

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("payments-activation-recovery"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Activation Recovery Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previousKeyId;
    env.RAZORPAY_KEY_SECRET = previousKeySecret;
    env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;

    await prisma.adminActionItem.deleteMany({ where: { type: "entitlement_activation_failed", entityType: "Payment", entityId: { in: paymentIds } } });
    await prisma.invoice.deleteMany({ where: { payment: { userId } } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { startsWith: "test-plan-actfail-" } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  function signFor(providerOrderId: string, razorpayPaymentId: string) {
    return crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${providerOrderId}|${razorpayPaymentId}`)
      .digest("hex");
  }

  it("marks a genuine post-capture activation failure as recoverable, then retryActivation() finishes it with no second charge", async () => {
    const suffix = uniqueSuffix();
    const planId = `test-plan-actfail-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Activation Recovery Test Plan", priceCents: 1499, billingCycle: "monthly", isActive: true },
    });

    const providerOrderId = `order_actfail_${suffix}`;
    const payment = await prisma.payment.create({
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
    paymentIds.push(payment.id);

    // The genuine failure trigger — the plan this payment references
    // vanishes between order-creation (already validated it existed) and
    // payment capture. subscribe() throws a real 404 plan_not_found; no
    // mocking involved.
    await prisma.subscriptionPlan.delete({ where: { id: planId } });

    const razorpayPaymentId = `pay_actfail_${suffix}`;
    const signature = signFor(providerOrderId, razorpayPaymentId);

    let caught: unknown;
    try {
      await verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature: signature });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiHttpError);
    expect((caught as ApiHttpError).code).toBe("entitlement_activation_failed");
    expect((caught as ApiHttpError).status).toBe(502);

    // The money stayed captured — that's the whole point. And the failure
    // is now real, queryable state, not a swallowed exception.
    const afterFailure = await getPaymentForUser(userId, payment.id);
    expect(afterFailure.status).toBe("paid");
    expect(afterFailure.activatedAt).toBeNull();
    expect(afterFailure.activationFailedAt).not.toBeNull();
    expect(afterFailure.activationFailureReason).toBe("plan_not_found");

    const subscriptionsAfterFailure = await prisma.subscription.findMany({ where: { userId, planId } });
    expect(subscriptionsAfterFailure).toHaveLength(0);

    // Admin Action Required queue (Wave 4, 20 Sep 2026) — a real, open
    // `entitlement_activation_failed` AdminActionItem must land for this
    // exact Payment, high severity (money captured, entitlement not
    // delivered), the moment activationFailedAt is set above.
    const actionItemsAfterFailure = await prisma.adminActionItem.findMany({
      where: { type: "entitlement_activation_failed", entityType: "Payment", entityId: payment.id },
    });
    expect(actionItemsAfterFailure).toHaveLength(1);
    expect(actionItemsAfterFailure[0].severity).toBe("high");
    expect(actionItemsAfterFailure[0].status).toBe("open");
    expect(actionItemsAfterFailure[0].metadata).toMatchObject({ purpose: "subscription", referenceId: planId, reason: "plan_not_found" });

    // Fix the underlying problem (the plan exists again) and retry — this
    // must NOT create a new Payment/charge, only finish the grant on the
    // existing one.
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Activation Recovery Test Plan", priceCents: 1499, billingCycle: "monthly", isActive: true },
    });

    const retryResult = await retryActivation(userId, payment.id);
    expect(retryResult.verified).toBe(true);
    expect(retryResult.purpose).toBe("subscription");

    const afterRetry = await getPaymentForUser(userId, payment.id);
    expect(afterRetry.status).toBe("paid");
    expect(afterRetry.activationFailedAt).toBeNull();
    expect(afterRetry.activationFailureReason).toBeNull();
    expect(afterRetry.activatedAt).not.toBeNull();

    const subscriptionsAfterRetry = await prisma.subscription.findMany({ where: { userId, planId } });
    expect(subscriptionsAfterRetry).toHaveLength(1);
    expect(subscriptionsAfterRetry[0].status).toBe("active");

    // Still exactly one Payment row for this order — a retry is not a new charge.
    const paymentRows = await prisma.payment.findMany({ where: { providerOrderId } });
    expect(paymentRows).toHaveLength(1);
  });

  it("retrying an already-succeeded payment is a no-op (nothing left to retry)", async () => {
    const suffix = uniqueSuffix();
    const planId = `test-plan-actfail-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "basic", name: "Activation Recovery No-Op Plan", priceCents: 999, billingCycle: "monthly", isActive: true },
    });
    const providerOrderId = `order_actfail_noop_${suffix}`;
    const payment = await prisma.payment.create({
      data: { userId, purpose: "subscription", referenceId: planId, amountCents: 999, currency: "INR", providerOrderId, status: "created" },
    });
    paymentIds.push(payment.id);
    const razorpayPaymentId = `pay_actfail_noop_${suffix}`;
    const signature = signFor(providerOrderId, razorpayPaymentId);

    await verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature: signature });

    let caught: unknown;
    try {
      await retryActivation(userId, payment.id);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiHttpError);
    expect((caught as ApiHttpError).code).toBe("activation_not_failed");
  });

  it("two concurrent retries of the same failed payment grant exactly one Subscription", async () => {
    const suffix = uniqueSuffix();
    const planId = `test-plan-actfail-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "elite", name: "Activation Recovery Concurrency Plan", priceCents: 2999, billingCycle: "monthly", isActive: true },
    });
    const providerOrderId = `order_actfail_race_${suffix}`;
    const payment = await prisma.payment.create({
      data: { userId, purpose: "subscription", referenceId: planId, amountCents: 2999, currency: "INR", providerOrderId, status: "created" },
    });
    paymentIds.push(payment.id);
    const razorpayPaymentId = `pay_actfail_race_${suffix}`;
    const signature = signFor(providerOrderId, razorpayPaymentId);

    // Produce a genuine failure the same way as the first test.
    await prisma.subscriptionPlan.delete({ where: { id: planId } });
    await expect(
      verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature: signature }),
    ).rejects.toMatchObject({ code: "entitlement_activation_failed" });

    // Fix it, then fire two retries concurrently — exactly the "atomic
    // claim, not read-then-write" discipline this session's other fixes
    // (activatePayment's own paid-claim, confirmFoodEstimate, decideRecommendation,
    // markPayoutPaid) already established, now applied to the retry path too.
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "elite", name: "Activation Recovery Concurrency Plan", priceCents: 2999, billingCycle: "monthly", isActive: true },
    });

    const results = await Promise.allSettled([retryActivation(userId, payment.id), retryActivation(userId, payment.id)]);
    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }

    const subscriptions = await prisma.subscription.findMany({ where: { userId, planId } });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].status).toBe("active");
  });

  it("a repeated fail-retry-fail cycle for the same Payment surfaces as one open AdminActionItem, not a duplicate per attempt", async () => {
    const suffix = uniqueSuffix();
    const planId = `test-plan-actfail-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Activation Recovery Dedup Plan", priceCents: 1999, billingCycle: "monthly", isActive: true },
    });
    const providerOrderId = `order_actfail_dedup_${suffix}`;
    const payment = await prisma.payment.create({
      data: { userId, purpose: "subscription", referenceId: planId, amountCents: 1999, currency: "INR", providerOrderId, status: "created" },
    });
    paymentIds.push(payment.id);
    const razorpayPaymentId = `pay_actfail_dedup_${suffix}`;
    const signature = signFor(providerOrderId, razorpayPaymentId);

    // First genuine failure — plan missing at capture time.
    await prisma.subscriptionPlan.delete({ where: { id: planId } });
    await expect(
      verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature: signature }),
    ).rejects.toMatchObject({ code: "entitlement_activation_failed" });

    const afterFirstFailure = await prisma.adminActionItem.findMany({
      where: { type: "entitlement_activation_failed", entityType: "Payment", entityId: payment.id },
    });
    expect(afterFirstFailure).toHaveLength(1);
    const firstItemId = afterFirstFailure[0].id;

    // Retry while the underlying problem is STILL broken (plan still
    // missing) — a real second pass through activatePayment()'s catch
    // block for the exact same Payment, the repeatable case this dedup
    // exists for.
    await expect(retryActivation(userId, payment.id)).rejects.toMatchObject({ code: "entitlement_activation_failed" });

    const afterSecondFailure = await prisma.adminActionItem.findMany({
      where: { type: "entitlement_activation_failed", entityType: "Payment", entityId: payment.id },
    });
    // Still exactly one row — the existing OPEN item was reused, not duplicated.
    expect(afterSecondFailure).toHaveLength(1);
    expect(afterSecondFailure[0].id).toBe(firstItemId);

    // Fix the plan and let a real retry succeed — the open item is left as
    // an admin's own thing to resolve (this wave doesn't auto-resolve it;
    // resolution is the existing, real POST /admin/action-items/:id/resolve
    // path), matching the rest of this queue's own resolve-is-a-separate-
    // admin-action convention.
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Activation Recovery Dedup Plan", priceCents: 1999, billingCycle: "monthly", isActive: true },
    });
    await retryActivation(userId, payment.id);

    const stillOneRow = await prisma.adminActionItem.findMany({
      where: { type: "entitlement_activation_failed", entityType: "Payment", entityId: payment.id },
    });
    expect(stillOneRow).toHaveLength(1);
    expect(stillOneRow[0].status).toBe("open");
  });
});
