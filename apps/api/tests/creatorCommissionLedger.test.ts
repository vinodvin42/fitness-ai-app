import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { createRefund } from "../src/modules/adminRefunds/adminRefunds.service";
import {
  applyRefundToCommission,
  approveCommission,
  createCommissionForPayment,
} from "../src/modules/creatorCommissions/creatorCommissions.service";

/**
 * Acceptance test 15 (spec §11): "A refund or chargeback moves the linked
 * creator commission to DISPUTED / REVERSED."
 *
 * This could not pass before R1 — neither state existed, and no
 * per-conversion commission record existed for a refund to be "linked" to.
 * These tests drive the real service against real Postgres rows (no
 * mocking, same convention as every other file here) and assert the
 * ledger state by reading it back, never by trusting a return value.
 *
 * Razorpay is deliberately unconfigured in this suite, so refunds land
 * `pending` rather than `processed` — which is itself worth asserting
 * against, because the commission must move either way. A commission left
 * payable while a refund is in flight is exactly how a payout run pays out
 * on a conversion that is being unwound.
 */
describe("Creator commission ledger (spec §10, acceptance test 15)", () => {
  let adminId: string;
  let influencerId: string;
  let campaignId: string;
  let sourceId: string;
  const created: { userIds: string[]; paymentIds: string[]; planIds: string[] } = {
    userIds: [],
    paymentIds: [],
    planIds: [],
  };
  const AMOUNT_CENTS = 200000;
  const COMMISSION_PCT = 20;

  /** A user attributed to the fixture creator via a real campaign touchpoint. */
  async function makeAttributedUserWithPayment(label: string, amountCents = AMOUNT_CENTS) {
    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: await hashPassword("unused"),
        fullName: `Commission Fixture ${label}`,
        referralCode: await generateUniqueReferralCode(),
      },
    });
    created.userIds.push(user.id);

    await prisma.touchpoint.create({
      data: { userId: user.id, campaignId, channel: "influencer", touchpointType: "signup" },
    });

    const planId = `plan-commission-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: {
        id: planId,
        tier: "pro",
        name: "Commission Fixture Plan",
        priceCents: amountCents,
        billingCycle: "monthly",
        isActive: true,
      },
    });
    created.planIds.push(planId);

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        purpose: "subscription",
        referenceId: planId,
        amountCents,
        currency: "INR",
        providerOrderId: `order_commission_${suffix}`,
        status: "paid",
      },
    });
    created.paymentIds.push(payment.id);
    return { user, payment };
  }

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-commission-${suffix}@example.com`,
        passwordHash: await hashPassword("unused"),
        fullName: "Commission Fixture Admin",
        role: "finance",
        status: "active",
      },
    });
    adminId = admin.id;

    const influencer = await prisma.influencer.create({
      data: { name: `Commission Fixture Creator ${suffix}`, commissionPct: COMMISSION_PCT, status: "active" },
    });
    influencerId = influencer.id;

    const source = await prisma.acquisitionSource.upsert({
      where: { channel: "influencer" },
      update: {},
      create: { channel: "influencer", label: "Creator" },
    });
    sourceId = source.id;

    const campaign = await prisma.campaign.create({
      data: {
        sourceId,
        name: `Commission Fixture Campaign ${suffix}`,
        linkCode: `cmsn-${suffix}`,
        influencerId,
        status: "active",
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.creatorCommission.deleteMany({ where: { influencerId } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: created.paymentIds } } });
    await prisma.expense.deleteMany({ where: { recordedByAdminId: adminId } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Refund" } });
    await prisma.payment.deleteMany({ where: { id: { in: created.paymentIds } } });
    await prisma.touchpoint.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.influencer.deleteMany({ where: { id: influencerId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: created.planIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  it("creates an eligible commission for an attributed, captured payment", async () => {
    const { payment } = await makeAttributedUserWithPayment("eligible");
    const commission = await createCommissionForPayment(payment.id);
    expect(commission).not.toBeNull();

    const stored = await prisma.creatorCommission.findUnique({ where: { paymentId: payment.id } });
    expect(stored?.status).toBe("eligible");
    expect(stored?.influencerId).toBe(influencerId);
    expect(stored?.commissionPct).toBe(COMMISSION_PCT);
    // Snapshot, not a live read off the influencer — 20% of ₹2000.00.
    expect(stored?.commissionCents).toBe((AMOUNT_CENTS * COMMISSION_PCT) / 100);
    expect(stored?.campaignId).toBe(campaignId);
  });

  it("is idempotent per payment, so a retried capture does not double-pay", async () => {
    const { payment } = await makeAttributedUserWithPayment("idempotent");
    await createCommissionForPayment(payment.id);
    await createCommissionForPayment(payment.id);
    const rows = await prisma.creatorCommission.findMany({ where: { paymentId: payment.id } });
    expect(rows).toHaveLength(1);
  });

  it("creates no commission for an unattributed user", async () => {
    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("unattributed"),
        passwordHash: await hashPassword("unused"),
        fullName: "Unattributed Fixture",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    created.userIds.push(user.id);
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        purpose: "subscription",
        referenceId: "none",
        amountCents: 1000,
        currency: "INR",
        providerOrderId: `order_unattr_${suffix}`,
        status: "paid",
      },
    });
    created.paymentIds.push(payment.id);

    expect(await createCommissionForPayment(payment.id)).toBeNull();
    expect(await prisma.creatorCommission.findUnique({ where: { paymentId: payment.id } })).toBeNull();
  });

  it("creates no commission for a payment that never captured", async () => {
    const { payment } = await makeAttributedUserWithPayment("uncaptured");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "created" } });
    expect(await createCommissionForPayment(payment.id)).toBeNull();
  });

  describe("acceptance test 15 — a refund moves the linked commission", () => {
    it("REVERSES the commission on a full refund, through the real admin refund endpoint", async () => {
      const { payment } = await makeAttributedUserWithPayment("full-refund");
      await createCommissionForPayment(payment.id);

      await createRefund(adminId, payment.id, {
        amountCents: AMOUNT_CENTS,
        reason: "User cancelled within the cooling-off window",
        confirmation: "RESOLVE",
      });

      const stored = await prisma.creatorCommission.findUnique({ where: { paymentId: payment.id } });
      expect(stored?.status).toBe("reversed");
      expect(stored?.refundId).not.toBeNull();
      expect(stored?.disputedReason).toBeTruthy();

      // §10: "no record may change another's state implicitly" — the
      // payment itself must still read as a successful payment.
      const paymentAfter = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(paymentAfter?.status).toBe("paid");
    });

    it("DISPUTES rather than reverses on a partial refund", async () => {
      const { payment } = await makeAttributedUserWithPayment("partial-refund");
      await createCommissionForPayment(payment.id);

      await createRefund(adminId, payment.id, {
        amountCents: Math.round(AMOUNT_CENTS / 4),
        reason: "Partial goodwill credit for the January outage",
        confirmation: "RESOLVE",
      });

      const stored = await prisma.creatorCommission.findUnique({ where: { paymentId: payment.id } });
      expect(stored?.status).toBe("disputed");
    });

    it("writes an audit row carrying the before/after state and the rule id", async () => {
      const { payment } = await makeAttributedUserWithPayment("audited");
      const commission = await createCommissionForPayment(payment.id);
      await applyRefundToCommission({
        paymentId: payment.id,
        refundId: "fixture-refund-id",
        refundedCents: AMOUNT_CENTS,
        actorAdminId: adminId,
      });

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "CreatorCommission", entityId: commission!.id },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.action).toBe("commission.reversed");
      expect(audit?.ruleId).toBe("BR-COM-012");
      expect(audit?.stateBefore).toMatchObject({ status: "eligible" });
      expect(audit?.stateAfter).toMatchObject({ status: "reversed" });
    });

    it("refuses to move a reversed commission back to payable", async () => {
      const { payment } = await makeAttributedUserWithPayment("terminal");
      const commission = await createCommissionForPayment(payment.id);
      await applyRefundToCommission({
        paymentId: payment.id,
        refundId: "fixture-refund-id-2",
        refundedCents: AMOUNT_CENTS,
        actorAdminId: adminId,
      });

      await expect(approveCommission(adminId, commission!.id, "Trying to approve a reversed row")).rejects.toMatchObject(
        { status: 409 },
      );
    });
  });

  it("approves an eligible commission and records the transition", async () => {
    const { payment } = await makeAttributedUserWithPayment("approved");
    const commission = await createCommissionForPayment(payment.id);

    await approveCommission(adminId, commission!.id, "January payout run, verified against the ledger");

    const stored = await prisma.creatorCommission.findUnique({ where: { id: commission!.id } });
    expect(stored?.status).toBe("approved");
    expect(stored?.approvedAt).not.toBeNull();
  });
});
