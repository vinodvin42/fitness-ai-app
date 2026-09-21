import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { setInfluencerPortalPassword } from "../src/modules/adminInfluencers/adminInfluencers.service";
import { hashPassword } from "../src/lib/password";
import { recordAcquisitionTouchpoint } from "../src/lib/acquisition";
import { generateUniqueReferralCode } from "../src/lib/referralCode";

/**
 * Creator Portal (R2 Wave 5, 21 Sep 2026) — real, Postgres-backed coverage
 * for:
 *  1. The influencerAuth login flow (admin grants a portal password via
 *     `setInfluencerPortalPassword`, then a real POST /influencers/auth/
 *     login against it).
 *  2. The influencer-scoped campaign/report/payout wrapper routes, with an
 *     explicit two-influencer fixture proving influencer A's dashboard
 *     never returns influencer B's campaigns, attribution numbers, or
 *     payouts — the "boundary discipline" requirement this wave's brief
 *     calls out by name.
 *
 * No mocking — same convention as every other file in this directory (see
 * helpers.ts's own doc comment): real HTTP via supertest against
 * createApp(), real Postgres rows.
 */
describe("Creator Portal: influencer auth + self-service scoping", () => {
  const app = buildApp();
  const password = "CreatorPortal9!";

  let adminId: string;
  let sourceId: string;
  let programId: string;
  let workoutId: string;

  let influencerAId: string;
  let influencerAEmail: string;
  let influencerBId: string;
  let influencerBEmail: string;

  let campaignAId: string;
  let campaignALinkCode: string;
  let campaignBId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-creator-portal-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Creator Portal Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;

    const source = await prisma.acquisitionSource.upsert({
      where: { channel: "influencer" },
      create: { channel: "influencer", label: "Creator" },
      update: {},
    });
    sourceId = source.id;

    const program = await prisma.program.create({
      data: {
        id: `creator-fixture-program-${suffix}`,
        name: `Creator Portal Fixture Program ${suffix}`,
        type: "fitness",
        description: "fixture",
        durationWeeks: 4,
      },
    });
    programId = program.id;
    const workout = await prisma.workout.create({
      data: { id: `creator-fixture-workout-${suffix}`, programId, name: "Fixture Workout", durationMinutes: 30 },
    });
    workoutId = workout.id;

    influencerAEmail = uniqueEmail("creator-a");
    influencerBEmail = uniqueEmail("creator-b");
    const influencerA = await prisma.influencer.create({
      data: { name: `Creator A ${suffix}`, email: influencerAEmail, commissionPct: 15 },
    });
    influencerAId = influencerA.id;
    const influencerB = await prisma.influencer.create({
      data: { name: `Creator B ${suffix}`, email: influencerBEmail, commissionPct: 15 },
    });
    influencerBId = influencerB.id;

    campaignALinkCode = `CREATOR-A-${suffix}`;
    const campaignA = await prisma.campaign.create({
      data: { name: `Creator A Campaign ${suffix}`, sourceId, linkCode: campaignALinkCode, influencerId: influencerAId },
    });
    campaignAId = campaignA.id;
    const campaignB = await prisma.campaign.create({
      data: { name: `Creator B Campaign ${suffix}`, sourceId, linkCode: `CREATOR-B-${suffix}`, influencerId: influencerBId },
    });
    campaignBId = campaignB.id;

    // Real signups attributed to A's and B's campaigns via the actual
    // production resolution function (recordAcquisitionTouchpoint), same
    // discipline adminAcquisition.test.ts uses.
    async function fixtureUser(label: string): Promise<string> {
      const user = await prisma.user.create({
        data: {
          email: uniqueEmail(`creator-portal-${label}`),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Creator Portal Fixture ${label}`,
          referralCode: await generateUniqueReferralCode(),
        },
      });
      createdUserIds.push(user.id);
      return user.id;
    }

    const userA1 = await fixtureUser("a1");
    const userA2 = await fixtureUser("a2");
    const userB1 = await fixtureUser("b1");
    await recordAcquisitionTouchpoint(userA1, `influencer:${campaignA.linkCode}`);
    await recordAcquisitionTouchpoint(userA2, `influencer:${campaignA.linkCode}`);
    await recordAcquisitionTouchpoint(userB1, `influencer:${campaignB.linkCode}`);
    await prisma.onboardingProfile.create({ data: { userId: userA1, completedAt: new Date() } });

    // Real admin-entered payouts, one per influencer.
    await prisma.influencerPayout.create({
      data: { influencerId: influencerAId, amountCents: 10000, periodLabel: `A ${suffix}`, status: "paid", paidAt: new Date() },
    });
    await prisma.influencerPayout.create({
      data: { influencerId: influencerBId, amountCents: 20000, periodLabel: `B ${suffix}` },
    });
  });

  afterAll(async () => {
    await prisma.influencerPayout.deleteMany({ where: { influencerId: { in: [influencerAId, influencerBId] } } });
    await prisma.touchpoint.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.onboardingProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.influencerRefreshToken.deleteMany({ where: { influencerId: { in: [influencerAId, influencerBId] } } });
    await prisma.campaign.deleteMany({ where: { id: { in: [campaignAId, campaignBId] } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorAdminId: adminId }, { actorInfluencerId: { in: [influencerAId, influencerBId] } }] } });
    await prisma.influencer.deleteMany({ where: { id: { in: [influencerAId, influencerBId] } } });
    await prisma.workoutSession.deleteMany({ where: { workoutId } });
    await prisma.workout.deleteMany({ where: { id: workoutId } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("rejects login before an admin has granted a portal password", async () => {
    const res = await request(app).post("/influencers/auth/login").send({ email: influencerAEmail, password });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("setInfluencerPortalPassword requires the influencer to have an email on file", async () => {
    const noEmailInfluencer = await prisma.influencer.create({
      data: { name: "No Email Fixture", commissionPct: 10 },
    });
    await expect(setInfluencerPortalPassword(adminId, noEmailInfluencer.id, { password })).rejects.toMatchObject({
      status: 422,
      code: "influencer_missing_email",
    });
    await prisma.influencer.deleteMany({ where: { id: noEmailInfluencer.id } });
  });

  it("grants portal access, logs in, and rejects the wrong password with a real audit trail", async () => {
    const setResult = await setInfluencerPortalPassword(adminId, influencerAId, { password });
    expect(setResult.ok).toBe(true);

    const wrongPassword = await request(app)
      .post("/influencers/auth/login")
      .send({ email: influencerAEmail, password: "totally-wrong" });
    expect(wrongPassword.status).toBe(401);

    const res = await request(app).post("/influencers/auth/login").send({ email: influencerAEmail, password });
    expect(res.status).toBe(200);
    expect(res.body.influencer.id).toBe(influencerAId);
    expect(res.body.influencer.passwordHash).toBeUndefined();
    expect(typeof res.body.tokens.accessToken).toBe("string");
    expect(typeof res.body.tokens.refreshToken).toBe("string");

    const audit = await prisma.auditLog.findFirst({
      where: { actorInfluencerId: influencerAId, action: "influencer.login" },
    });
    expect(audit).not.toBeNull();

    const setAudit = await prisma.auditLog.findFirst({
      where: { actorAdminId: adminId, action: "influencer.set_portal_password", entityId: influencerAId },
    });
    expect(setAudit).not.toBeNull();
  });

  it("GET /influencers/me returns the caller's own profile only via a valid token", async () => {
    const login = await request(app).post("/influencers/auth/login").send({ email: influencerAEmail, password });
    const me = await request(app)
      .get("/influencers/me")
      .set("Authorization", `Bearer ${login.body.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.influencer.id).toBe(influencerAId);

    const noToken = await request(app).get("/influencers/me");
    expect(noToken.status).toBe(401);
  });

  it("boundary discipline: influencer A's campaigns/report/payouts never include influencer B's data", async () => {
    // Grant B a password too, log both in.
    await setInfluencerPortalPassword(adminId, influencerBId, { password });
    const loginA = await request(app).post("/influencers/auth/login").send({ email: influencerAEmail, password });
    const loginB = await request(app).post("/influencers/auth/login").send({ email: influencerBEmail, password });
    const tokenA = loginA.body.tokens.accessToken as string;
    const tokenB = loginB.body.tokens.accessToken as string;

    // Campaigns
    const campaignsA = await request(app).get("/influencer-portal/campaigns").set("Authorization", `Bearer ${tokenA}`);
    expect(campaignsA.status).toBe(200);
    expect(campaignsA.body.campaigns.map((c: { id: string }) => c.id)).toEqual([campaignAId]);
    expect(campaignsA.body.campaigns.some((c: { id: string }) => c.id === campaignBId)).toBe(false);

    const campaignsB = await request(app).get("/influencer-portal/campaigns").set("Authorization", `Bearer ${tokenB}`);
    expect(campaignsB.body.campaigns.map((c: { id: string }) => c.id)).toEqual([campaignBId]);

    // Acquisition report — real numbers for A's own campaign, and B's
    // campaign/registrations never leak into A's response.
    const reportA = await request(app)
      .get("/influencer-portal/acquisition-report")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(reportA.status).toBe(200);
    expect(reportA.body.byChannel).toBeUndefined();
    const aRow = reportA.body.byCampaign.find((r: { campaignId: string }) => r.campaignId === campaignAId);
    expect(aRow).toBeDefined();
    expect(aRow.registrations).toBe(2);
    expect(aRow.registeredUsers).toBe(2);
    expect(aRow.activatedUsers).toBe(1);
    expect(reportA.body.byCampaign.some((r: { campaignId: string }) => r.campaignId === campaignBId)).toBe(false);
    expect(reportA.body.totals.registrations).toBe(2);

    const reportB = await request(app)
      .get("/influencer-portal/acquisition-report")
      .set("Authorization", `Bearer ${tokenB}`);
    const bRow = reportB.body.byCampaign.find((r: { campaignId: string }) => r.campaignId === campaignBId);
    expect(bRow.registrations).toBe(1);
    expect(reportB.body.byCampaign.some((r: { campaignId: string }) => r.campaignId === campaignAId)).toBe(false);

    // Payouts
    const payoutsA = await request(app).get("/influencer-portal/payouts").set("Authorization", `Bearer ${tokenA}`);
    expect(payoutsA.status).toBe(200);
    expect(payoutsA.body.payouts).toHaveLength(1);
    expect(payoutsA.body.payouts[0].amountCents).toBe(10000);
    expect(payoutsA.body.counts.paidCents).toBe(10000);
    expect(payoutsA.body.counts.pendingCents).toBe(0);

    const payoutsB = await request(app).get("/influencer-portal/payouts").set("Authorization", `Bearer ${tokenB}`);
    expect(payoutsB.body.payouts).toHaveLength(1);
    expect(payoutsB.body.payouts[0].amountCents).toBe(20000);
    expect(payoutsB.body.counts.pendingCents).toBe(20000);

    // Profile
    const meA = await request(app).get("/influencer-portal/me").set("Authorization", `Bearer ${tokenA}`);
    expect(meA.body.influencer.id).toBe(influencerAId);
    expect(meA.body.influencer.notes).toBeUndefined();
  });

  it("rejects a request with no token and with a garbage token", async () => {
    const noToken = await request(app).get("/influencer-portal/campaigns");
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get("/influencer-portal/campaigns")
      .set("Authorization", "Bearer not-a-real-token");
    expect(badToken.status).toBe(401);
  });

  it("refreshes and logs out a real session", async () => {
    const login = await request(app).post("/influencers/auth/login").send({ email: influencerAEmail, password });
    const refresh = await request(app)
      .post("/influencers/auth/refresh")
      .send({ refreshToken: login.body.tokens.refreshToken });
    expect(refresh.status).toBe(200);
    expect(typeof refresh.body.tokens.accessToken).toBe("string");

    const logout = await request(app)
      .post("/influencers/auth/logout")
      .send({ refreshToken: refresh.body.tokens.refreshToken });
    expect(logout.status).toBe(204);

    const reuseAfterLogout = await request(app)
      .post("/influencers/auth/refresh")
      .send({ refreshToken: refresh.body.tokens.refreshToken });
    expect(reuseAfterLogout.status).toBe(401);
  });
});
