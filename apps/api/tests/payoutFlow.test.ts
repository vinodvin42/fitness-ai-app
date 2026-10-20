import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { buildApp, createPricedOffering, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signAdminAccessToken } from "../src/lib/adminJwt";
import { env } from "../src/config/env";
import { verifyPayment } from "../src/modules/payments/payments.service";

/**
 * Payout flow end to end (admin audit item 1, Oct 2026):
 * - a captured payment from a creator-attributed member creates the creator's commission;
 * - "Settle" records a coach month as owed (eligible), with no expense yet;
 * - both wait on Payout Runs until approved; a run pays them and records the Finance expense;
 * - a payout that fails becomes an Action Required item, resolved when a later run pays it.
 */
describe("Payout flow: owed -> approved -> paid", () => {
  const app = buildApp();
  let auth = "";
  let adminId = "";
  let influencerId = "";
  let campaignId = "";
  let userId = "";
  let professionalId = "";
  let offeringCleanup: (() => Promise<void>) | null = null;
  const planIds: string[] = [];
  let previous: { id?: string; secret?: string } = {};

  beforeAll(async () => {
    previous = { id: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET };
    env.RAZORPAY_KEY_ID = "rzp_test_payout_flow_fixture";
    env.RAZORPAY_KEY_SECRET = "payout-flow-test-key-secret";

    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: { email: `payout-flow-${suffix}@example.com`, passwordHash: await hashPassword("unused"), fullName: "Payout Flow Admin", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    auth = `Bearer ${signAdminAccessToken({ sub: admin.id, email: admin.email, role: "super_admin" }).token}`;

    const influencer = await prisma.influencer.create({ data: { name: `Payout Flow Creator ${suffix}`, commissionPct: 10, status: "active" } });
    influencerId = influencer.id;
    const source = await prisma.acquisitionSource.upsert({ where: { channel: "influencer" }, update: {}, create: { channel: "influencer", label: "Creator" } });
    const campaign = await prisma.campaign.create({
      data: { sourceId: source.id, name: `Payout Flow Campaign ${suffix}`, linkCode: `pflow-${suffix}`, influencerId, status: "active" },
    });
    campaignId = campaign.id;

    const user = await prisma.user.create({
      data: { email: uniqueEmail("payout-flow"), passwordHash: await hashPassword("unused"), fullName: "Payout Flow Member", referralCode: await generateUniqueReferralCode() },
    });
    userId = user.id;
    await prisma.touchpoint.create({ data: { userId, campaignId, channel: "influencer", touchpointType: "signup" } });

    const professional = await prisma.professional.create({
      data: {
        email: `payout-flow-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused"),
        fullName: "Payout Flow Coach",
        status: "active",
        credentials: { create: { serviceType: "fitness", status: "verified" } },
      },
    });
    professionalId = professional.id;
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previous.id;
    env.RAZORPAY_KEY_SECRET = previous.secret;
    const commissions = await prisma.creatorCommission.findMany({ where: { influencerId }, select: { id: true } });
    const settlements = await prisma.coachSettlement.findMany({ where: { professionalId }, select: { id: true } });
    await prisma.adminActionItem.deleteMany({ where: { entityId: { in: [...commissions, ...settlements].map((r) => r.id) } } });
    await prisma.creatorCommission.deleteMany({ where: { influencerId } });
    await prisma.coachSettlement.deleteMany({ where: { professionalId } });
    await prisma.payoutBatch.deleteMany({ where: { createdByAdminId: adminId } });
    await prisma.expense.deleteMany({ where: { recordedByAdminId: adminId } });
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    if (offeringCleanup) await offeringCleanup();
    await prisma.invoice.deleteMany({ where: { payment: { userId } } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.touchpoint.deleteMany({ where: { userId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.influencer.deleteMany({ where: { id: influencerId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  async function capturedSubscriptionPayment(amountCents: number) {
    const suffix = uniqueSuffix();
    const planId = `plan-payout-flow-${suffix}`;
    planIds.push(planId);
    await prisma.subscriptionPlan.create({ data: { id: planId, tier: "grow", name: "Payout Flow Plan", priceCents: amountCents, billingCycle: "monthly", isActive: true } });
    const providerOrderId = `order_payout_flow_${suffix}`;
    const payment = await prisma.payment.create({
      data: { userId, purpose: "subscription", referenceId: planId, amountCents, currency: "INR", providerOrderId, status: "created" },
    });
    const razorpayPaymentId = `pay_payout_flow_${suffix}`;
    const razorpaySignature = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET!).update(`${providerOrderId}|${razorpayPaymentId}`).digest("hex");
    await verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature });
    return payment;
  }

  it("creates the creator's commission when an attributed member's payment is captured", async () => {
    const payment = await capturedSubscriptionPayment(100000);
    const commission = await prisma.creatorCommission.findUnique({ where: { paymentId: payment.id } });
    expect(commission).toMatchObject({ influencerId, status: "eligible", commissionPct: 10, grossCents: 100000, commissionCents: 10000 });

    const waiting = await request(app).get("/admin/payout-runs/awaiting-approval").set("Authorization", auth);
    expect(waiting.status).toBe(200);
    expect(waiting.body.commissions.map((c: { id: string }) => c.id)).toContain(commission!.id);
  });

  it("approves a commission, fails it in one run (queued), then pays it in the next (resolved, expensed)", async () => {
    const commission = (await prisma.creatorCommission.findFirst({ where: { influencerId, status: "eligible" } }))!;
    const approved = await request(app)
      .post(`/admin/commissions/${commission.id}/approve`)
      .set("Authorization", auth)
      .send({ reason: "Checked against the payment" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");

    // Other tests' approved rows may share the ledger; only this commission's journey is asserted.
    const run1 = await request(app)
      .post("/admin/payout-runs")
      .set("Authorization", auth)
      .send({ kind: "creator_commission", reason: "Weekly creator payouts", confirmation: "RESOLVE" });
    expect(run1.status).toBe(201);
    const failed = await request(app)
      .post(`/admin/payout-runs/${run1.body.id}/settle`)
      .set("Authorization", auth)
      .send({ reason: "Bank rejected one transfer", failedIds: [commission.id], failureReason: "Account closed" });
    expect(failed.status).toBe(200);
    const queued = await prisma.adminActionItem.findFirst({ where: { type: "payout_failed", entityType: "CreatorCommission", entityId: commission.id } });
    expect(queued).toMatchObject({ status: "open", severity: "high" });

    const run2 = await request(app)
      .post("/admin/payout-runs")
      .set("Authorization", auth)
      .send({ kind: "creator_commission", reason: "Retry failed creator payouts", confirmation: "RESOLVE" });
    expect(run2.status).toBe(201);
    const paid = await request(app).post(`/admin/payout-runs/${run2.body.id}/settle`).set("Authorization", auth).send({ reason: "All transfers went through" });
    expect(paid.status).toBe(200);
    expect((await prisma.creatorCommission.findUnique({ where: { id: commission.id } }))!.status).toBe("paid");
    expect((await prisma.adminActionItem.findUnique({ where: { id: queued!.id } }))!.status).toBe("resolved");
    const expense = await prisma.expense.findFirst({ where: { recordedByAdminId: adminId, category: "influencer_payout", amountCents: 10000 } });
    expect(expense).not.toBeNull();
  });

  it("Settle records a coach month as owed; approval and a payout run pay it and record the expense", async () => {
    const priced = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 80000 });
    offeringCleanup = priced.cleanup;
    const delivered = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.booking.create({
      data: { userId, professionalId, offeringId: priced.offering.id, scheduledAt: delivered, durationMinutes: 60, priceCents: 80000, commissionPct: 25, status: "confirmed" },
    });
    const month = `${delivered.getUTCFullYear()}-${String(delivered.getUTCMonth() + 1).padStart(2, "0")}`;

    const settled = await request(app).post("/admin/settlements").set("Authorization", auth).send({ professionalId, month, reason: "Month closed for this coach" });
    expect(settled.status).toBe(201);
    const settlement = (await prisma.coachSettlement.findFirst({ where: { professionalId } }))!;
    expect(settlement).toMatchObject({ status: "eligible", grossCents: 80000, commissionCents: 20000, netCents: 60000, paidAt: null });
    expect(await prisma.expense.count({ where: { recordedByAdminId: adminId, category: "coach_settlement" } })).toBe(0);

    const dash = await request(app).get("/admin/finance/dashboard").set("Authorization", auth);
    expect(dash.status).toBe(200);
    expect(dash.body.requiredActions.pendingSettlements.amountCents).toBeGreaterThanOrEqual(60000);
    expect(dash.body.notAvailable).toEqual([]);

    const approve = await request(app).post(`/admin/settlements/${settlement.id}/approve`).set("Authorization", auth).send({ reason: "Sessions checked" });
    expect(approve.status).toBe(200);
    const run = await request(app)
      .post("/admin/payout-runs")
      .set("Authorization", auth)
      .send({ kind: "professional_earning", reason: "Monthly coach payouts", confirmation: "RESOLVE" });
    expect(run.status).toBe(201);
    const done = await request(app).post(`/admin/payout-runs/${run.body.id}/settle`).set("Authorization", auth).send({ reason: "Transfers went through" });
    expect(done.status).toBe(200);
    expect((await prisma.coachSettlement.findUnique({ where: { id: settlement.id } }))!.status).toBe("paid");
    const expense = await prisma.expense.findFirst({ where: { recordedByAdminId: adminId, category: "coach_settlement" } });
    expect(expense).toMatchObject({ amountCents: 60000, status: "paid" });
  });
});
