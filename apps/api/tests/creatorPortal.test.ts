import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { createCommissionForPayment } from "../src/modules/creatorCommissions/creatorCommissions.service";
import { approveCommission } from "../src/modules/creatorCommissions/creatorCommissions.service";
import { createPayoutRun, settlePayoutRun } from "../src/modules/payoutRuns/payoutRuns.service";

const app = buildApp();

/**
 * Creator Partner Lite — C-M2 ("commission ledger 'payout failed' state
 * + reason") and the referral tools screen, plus BR-CRT-002 ("creators
 * see commercial aggregates only; never health, nutrition logs, photos
 * or AI chats").
 */
describe("Creator Partner Lite portal", () => {
  let influencerId = "";
  let otherInfluencerId = "";
  let adminId = "";
  let campaignId = "";
  let token = "";
  let userId = "";
  let paymentId = "";
  let planId = "";
  const PASSWORD = "PortalPass123!";
  const suffix = uniqueSuffix();
  const AMOUNT = 100000;

  beforeAll(async () => {
    const influencer = await prisma.influencer.create({
      data: {
        name: "Creator Portal Fixture",
        email: `creator-portal-${suffix}@example.com`,
        handle: "@fixture",
        commissionPct: 25,
        status: "active",
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    influencerId = influencer.id;

    const other = await prisma.influencer.create({
      data: { name: "Other Creator", commissionPct: 10, status: "active" },
    });
    otherInfluencerId = other.id;

    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-creator-${suffix}@example.com`,
        passwordHash: await hashPassword("unused"),
        fullName: "Creator Fixture Admin",
        role: "finance",
        status: "active",
      },
    });
    adminId = admin.id;

    const source = await prisma.acquisitionSource.upsert({
      where: { channel: "influencer" },
      update: {},
      create: { channel: "influencer", label: "Creator" },
    });
    const campaign = await prisma.campaign.create({
      data: {
        sourceId: source.id,
        name: "Fixture Campaign",
        linkCode: `cp-${suffix}`,
        influencerId,
        status: "active",
      },
    });
    campaignId = campaign.id;

    // A converting user with health data, so the isolation assertion is real.
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("creator-conv"),
        passwordHash: await hashPassword("unused"),
        fullName: "Converting Member",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;
    await prisma.touchpoint.create({
      data: { userId, campaignId, channel: "influencer", touchpointType: "signup" },
    });

    planId = `plan-creator-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Premium", priceCents: AMOUNT, billingCycle: "monthly", isActive: true },
    });
    const payment = await prisma.payment.create({
      data: {
        userId,
        purpose: "subscription",
        referenceId: planId,
        amountCents: AMOUNT,
        currency: "INR",
        providerOrderId: `order_creator_${suffix}`,
        status: "paid",
      },
    });
    paymentId = payment.id;

    const login = await request(app)
      .post("/influencers/auth/login")
      .send({ email: influencer.email, password: PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.creatorCommission.deleteMany({ where: { influencerId: { in: [influencerId, otherInfluencerId] } } });
    await prisma.payoutBatch.deleteMany({ where: { createdByAdminId: adminId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.touchpoint.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.influencer.deleteMany({ where: { id: { in: [influencerId, otherInfluencerId] } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it("reports the commission ledger with totals", async () => {
    await createCommissionForPayment(paymentId);

    const res = await request(app).get("/influencer-portal/commissions").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].commissionCents).toBe(AMOUNT * 0.25);
    expect(res.body.totals.pendingCents).toBe(AMOUNT * 0.25);
  });

  it("never reveals who converted (BR-CRT-002)", async () => {
    const res = await request(app).get("/influencer-portal/commissions").set(auth());
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain("Converting Member");
    expect(blob).not.toContain(userId);
    expect(blob).not.toContain(paymentId);
  });

  it("C-M2: a failed payout leaves a reason on the ledger, not silence", async () => {
    const commission = await prisma.creatorCommission.findUnique({ where: { paymentId } });
    await approveCommission(adminId, commission!.id, "January run, verified against the ledger");

    const batch = await createPayoutRun(adminId, "creator_commission", {
      reason: "January creator payout run",
      confirmation: "RESOLVE",
    });
    await settlePayoutRun(adminId, batch.id, {
      reason: "Bank rejected one transfer",
      failedIds: [commission!.id],
      failureReason: "Bank account details rejected by the payout provider",
    });

    const res = await request(app).get("/influencer-portal/commissions").set(auth());
    const entry = res.body.entries[0];
    // The status returns to approved — the money is still owed — so
    // without the reason the creator would see nothing had happened.
    expect(entry.status).toBe("approved");
    expect(entry.payoutFailureReason).toContain("Bank account details rejected");
    expect(res.body.hasPayoutFailure).toBe(true);
  });

  it("clears the failure once the retry pays", async () => {
    const commission = await prisma.creatorCommission.findUnique({ where: { paymentId } });
    const batch = await createPayoutRun(adminId, "creator_commission", {
      reason: "February retry after fixing bank details",
      confirmation: "RESOLVE",
    });
    await settlePayoutRun(adminId, batch.id, { reason: "All transfers cleared" });

    const res = await request(app).get("/influencer-portal/commissions").set(auth());
    const entry = res.body.entries.find((e: { id: string }) => e.id === commission!.id);
    expect(entry.status).toBe("paid");
    // A paid row showing a stale failure note is its own support ticket.
    expect(entry.payoutFailureReason).toBeNull();
    expect(res.body.hasPayoutFailure).toBe(false);
    expect(res.body.totals.paidCents).toBe(AMOUNT * 0.25);
  });

  it("serves referral tools with lowercase fynrox.app links (Q4)", async () => {
    const res = await request(app).get("/influencer-portal/referral-tools").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0].url).toBe(`https://fynrox.app/r/cp-${suffix}`);
    expect(res.body.links[0].qrPngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(res.body.links[0].live).toBe(true);
  });

  it("marks a link as not live when its campaign is inactive", async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "inactive" } });
    const res = await request(app).get("/influencer-portal/referral-tools").set(auth());
    // A creator posting a dead link to an audience of thousands is worth
    // one boolean.
    expect(res.body.links[0].live).toBe(false);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });
  });

  it("shows one creator nothing of another's ledger", async () => {
    await prisma.creatorCommission.create({
      data: {
        influencerId: otherInfluencerId,
        paymentId: (
          await prisma.payment.create({
            data: {
              userId,
              purpose: "subscription",
              referenceId: planId,
              amountCents: 5000,
              currency: "INR",
              providerOrderId: `order_other_${uniqueSuffix()}`,
              status: "paid",
            },
          })
        ).id,
        commissionPct: 10,
        grossCents: 5000,
        commissionCents: 500,
        status: "eligible",
      },
    });

    const res = await request(app).get("/influencer-portal/commissions").set(auth());
    expect(res.body.entries.every((e: { commissionCents: number }) => e.commissionCents !== 500)).toBe(true);
  });

  it("requires creator auth", async () => {
    expect((await request(app).get("/influencer-portal/commissions")).status).toBe(401);
    expect((await request(app).get("/influencer-portal/referral-tools")).status).toBe(401);
  });
});
