import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { createRefund } from "../src/modules/adminRefunds/adminRefunds.service";

/**
 * Regression test for a real over-refund race in adminRefunds.service.ts's
 * createRefund(): the same "read-then-write, not atomic" class already
 * fixed five times elsewhere in this codebase (payments.service.ts's
 * activatePayment, nutrition.service.ts's confirmFoodEstimate,
 * adminInfluencers.service.ts's markPayoutPaid, plans.service.ts's
 * decideRecommendation), but this one caps a running SUM across every
 * non-failed Refund on a Payment rather than flipping a single row's
 * status, so it can't be fixed with the usual conditional `updateMany`.
 *
 * The old code read `payment.refunds` (via a plain `findUnique`), summed
 * `alreadyRefunded`, and only THEN created a new Refund row with no lock in
 * between — so two concurrent refund requests against the same Payment
 * (e.g. an admin double-clicking "Issue Refund") could both read the same
 * `alreadyRefunded` total, both pass the `amountCents > remaining` check,
 * and both succeed — refunding more than the Payment ever collected. This
 * test drives two concurrent createRefund() calls, each for the full
 * payment amount, against one already-paid, ungateway-configured Payment
 * (Razorpay is deliberately unconfigured in this suite — see
 * paymentsActivationRace.test.ts's own comment — so both calls exercise the
 * pure DB claim path without needing a mocked gateway) and asserts exactly
 * one succeeds, the other gets a clean 422 `over_refund` (not a silent
 * double-refund), and the total refunded never exceeds the payment amount.
 */
describe("Refund over-refund race: concurrent refunds must not exceed the payment amount", () => {
  let adminId: string;
  let userId: string;
  let planId: string;
  let paymentId: string;
  const AMOUNT_CENTS = 100000;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-refund-race-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Refund Race Fixture Admin",
        role: "finance",
        status: "active",
      },
    });
    adminId = admin.id;

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("refund-race"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Refund Race Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    planId = `test-plan-refund-race-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Refund Race Fixture Plan", priceCents: AMOUNT_CENTS, billingCycle: "monthly", isActive: true },
    });

    const payment = await prisma.payment.create({
      data: {
        userId,
        purpose: "subscription",
        referenceId: planId,
        amountCents: AMOUNT_CENTS,
        currency: "INR",
        providerOrderId: `order_refund_race_${suffix}`,
        status: "paid",
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { recordedByAdminId: adminId } });
    await prisma.refund.deleteMany({ where: { paymentId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("only lets one of two concurrent full-amount refunds through", async () => {
    const results = await Promise.allSettled([
      createRefund(adminId, paymentId, { amountCents: AMOUNT_CENTS }),
      createRefund(adminId, paymentId, { amountCents: AMOUNT_CENTS }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toMatchObject({ status: 422, code: "over_refund" });

    const refunds = await prisma.refund.findMany({ where: { paymentId } });
    expect(refunds).toHaveLength(1);
    const totalRefundedCents = refunds.reduce((sum, r) => sum + r.amountCents, 0);
    expect(totalRefundedCents).toBeLessThanOrEqual(AMOUNT_CENTS);
  });
});
