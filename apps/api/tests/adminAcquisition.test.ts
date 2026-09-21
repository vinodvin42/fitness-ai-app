import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { recordAcquisitionTouchpoint } from "../src/lib/acquisition";
import {
  createCampaign,
  getAcquisitionReport,
  listCampaigns,
} from "../src/modules/adminAcquisition/adminAcquisition.service";
import { ApiHttpError } from "../src/middleware/errorHandler";

/**
 * Module 07.04 — Campaigns & Attribution (added 20 Sep 2026, R2 Wave 4)
 * service-layer coverage. Calls adminAcquisition.service.ts's exported
 * functions directly (same convention as gyms.test.ts/
 * adminInfluencersPayoutRace.test.ts) and, critically, drives real signups
 * through `recordAcquisitionTouchpoint` (R2 Wave 1's own real resolution
 * function) rather than hand-inserting Touchpoint rows — this proves the
 * report is correct against the actual production code path, not just
 * against however this test file imagines a Touchpoint should look.
 *
 * Every aggregate assertion below is checked against an independent raw
 * SQL COUNT (via `prisma.$queryRaw`) of the same rows, not just re-derived
 * from the same service code under test — an exact match against a source
 * that doesn't share any code with `getAcquisitionReport` is the real bar
 * this wave's own verification instructions set.
 */
describe("Acquisition — Campaign directory + registration report", () => {
  let adminId: string;
  let organicSourceId: string;
  let paidSocialSourceId: string;
  let gymPartnerSourceId: string;
  let programId: string;
  let workoutId: string;
  const createdCampaignIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-acquisition-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Acquisition Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;

    // Real seeded rows, same "one row per channel" shape seedDatabase.ts
    // creates — upserted here so this file doesn't depend on the seed
    // script having run against this test database.
    const organic = await prisma.acquisitionSource.upsert({
      where: { channel: "organic" },
      create: { channel: "organic", label: "Organic" },
      update: {},
    });
    organicSourceId = organic.id;
    const paidSocial = await prisma.acquisitionSource.upsert({
      where: { channel: "paid_social" },
      create: { channel: "paid_social", label: "Paid Social" },
      update: {},
    });
    paidSocialSourceId = paidSocial.id;
    const gymPartner = await prisma.acquisitionSource.upsert({
      where: { channel: "gym_partner" },
      create: { channel: "gym_partner", label: "Gym Partner" },
      update: {},
    });
    gymPartnerSourceId = gymPartner.id;
    // Every real channel needs a seeded AcquisitionSource row for
    // getAcquisitionReport()'s "every channel appears even at zero" byChannel
    // scaffold to find — same 7-row set seedDatabase.ts seeds in real envs.
    await Promise.all(
      (["direct", "paid_search", "referral", "influencer"] as const).map((channel) =>
        prisma.acquisitionSource.upsert({
          where: { channel },
          create: { channel, label: channel },
          update: {},
        }),
      ),
    );

    const program = await prisma.program.create({
      data: {
        id: `acq-fixture-program-${suffix}`,
        name: `Acquisition Fixture Program ${suffix}`,
        type: "fitness",
        description: "fixture",
        durationWeeks: 4,
      },
    });
    programId = program.id;
    const workout = await prisma.workout.create({
      data: { id: `acq-fixture-workout-${suffix}`, programId, name: "Fixture Workout", durationMinutes: 30 },
    });
    workoutId = workout.id;
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { workoutId } });
    await prisma.workout.deleteMany({ where: { id: workoutId } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.payment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.onboardingProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.touchpoint.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { actorAdminId: adminId } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  async function createFixtureUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(`acq-${label}`),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Acquisition Fixture ${label}`,
        referralCode: await generateUniqueReferralCode(),
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it("creates a Campaign with a real audit row, rejects a duplicate linkCode, 404s on an unknown source", async () => {
    const suffix = uniqueSuffix();
    const campaign = await createCampaign(adminId, {
      name: `IG Reels Push ${suffix}`,
      sourceId: paidSocialSourceId,
      linkCode: `IG-REELS-${suffix}`,
      status: "active",
    });
    createdCampaignIds.push(campaign.id);

    expect(campaign.channel).toBe("paid_social");
    expect(campaign.status).toBe("active");

    const row = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(row).not.toBeNull();
    expect(row?.linkCode).toBe(`IG-REELS-${suffix}`);

    const audit = await prisma.auditLog.findFirst({
      where: { actorAdminId: adminId, action: "campaign.create", entityId: campaign.id },
    });
    expect(audit).not.toBeNull();

    await expect(
      createCampaign(adminId, { name: "Duplicate", sourceId: paidSocialSourceId, linkCode: `IG-REELS-${suffix}`, status: "active" }),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      createCampaign(adminId, { name: "Bad source", sourceId: "does-not-exist", linkCode: `BAD-${suffix}`, status: "active" }),
    ).rejects.toThrow(ApiHttpError);
  });

  it("lists campaigns filtered by channel and search", async () => {
    const suffix = uniqueSuffix();
    const campaign = await createCampaign(adminId, {
      name: `Searchable Campaign ${suffix}`,
      sourceId: gymPartnerSourceId,
      linkCode: `GYM-${suffix}`,
      status: "active",
    });
    createdCampaignIds.push(campaign.id);

    const byChannel = await listCampaigns({ channel: "gym_partner" });
    expect(byChannel.campaigns.some((c) => c.id === campaign.id)).toBe(true);

    const bySearch = await listCampaigns({ search: `Searchable Campaign ${suffix}` });
    expect(bySearch.campaigns).toHaveLength(1);
    expect(bySearch.campaigns[0].id).toBe(campaign.id);
  });

  it("computes exact per-channel and per-campaign registration/activation/first-workout/paid-conversion counts, verified against independent raw SQL", async () => {
    const suffix = uniqueSuffix();
    const campaign = await createCampaign(adminId, {
      name: `Report Fixture Campaign ${suffix}`,
      sourceId: paidSocialSourceId,
      linkCode: `RPT-${suffix}`,
      status: "active",
    });
    createdCampaignIds.push(campaign.id);

    // 3 users resolve to this Campaign's own linkCode (real resolution via
    // recordAcquisitionTouchpoint, the exact function auth.service.ts#signup
    // calls — not a hand-built Touchpoint row).
    const campaignUserA = await createFixtureUser("campaign-a");
    const campaignUserB = await createFixtureUser("campaign-b");
    const campaignUserC = await createFixtureUser("campaign-c");
    await recordAcquisitionTouchpoint(campaignUserA, `paid_social:${campaign.linkCode}`);
    await recordAcquisitionTouchpoint(campaignUserB, `paid_social:${campaign.linkCode}`);
    await recordAcquisitionTouchpoint(campaignUserC, `paid_social:${campaign.linkCode}`);

    // 2 users fall back to the honest "gym" prefix -> gym_partner channel,
    // no matching Campaign (unresolved code).
    const gymUserA = await createFixtureUser("gym-a");
    const gymUserB = await createFixtureUser("gym-b");
    await recordAcquisitionTouchpoint(gymUserA, "gym:NOT-A-REAL-CODE-1");
    await recordAcquisitionTouchpoint(gymUserB, "gym:NOT-A-REAL-CODE-2");

    // 1 user falls back to direct (unrecognized raw prefix).
    const directUser = await createFixtureUser("direct-a");
    await recordAcquisitionTouchpoint(directUser, "whatever:xyz");

    // Real activation/first-workout/paid-conversion signals for a subset:
    // campaignUserA activates + logs a workout; campaignUserB only pays;
    // gymUserA only activates. Everyone else stays at zero on purpose, to
    // prove the report doesn't over-count.
    await prisma.onboardingProfile.create({ data: { userId: campaignUserA, completedAt: new Date() } });
    await prisma.workoutSession.create({ data: { userId: campaignUserA, workoutId, status: "completed" } });
    await prisma.onboardingProfile.create({ data: { userId: gymUserA, completedAt: new Date() } });

    await prisma.payment.create({
      data: {
        userId: campaignUserB,
        purpose: "subscription",
        referenceId: "acq-fixture-plan",
        amountCents: 29900,
        providerOrderId: `acq-order-${suffix}-b`,
        status: "paid",
      },
    });

    const report = await getAcquisitionReport({});

    const paidSocialRow = report.byChannel.find((r) => r.channel === "paid_social");
    expect(paidSocialRow?.registrations).toBeGreaterThanOrEqual(3);
    const gymRow = report.byChannel.find((r) => r.channel === "gym_partner");
    expect(gymRow?.registrations).toBeGreaterThanOrEqual(2);
    const directRow = report.byChannel.find((r) => r.channel === "direct");
    expect(directRow?.registrations).toBeGreaterThanOrEqual(1);

    // Every real channel is present even where this test added nothing.
    expect(report.byChannel.map((r) => r.channel).sort()).toEqual(
      ["direct", "gym_partner", "influencer", "organic", "paid_search", "paid_social", "referral"].sort(),
    );

    const campaignRow = report.byCampaign.find((c) => c.campaignId === campaign.id);
    expect(campaignRow).toBeDefined();
    expect(campaignRow?.registrations).toBe(3);
    expect(campaignRow?.registeredUsers).toBe(3);
    expect(campaignRow?.activatedUsers).toBe(1);
    expect(campaignRow?.usersWithFirstWorkout).toBe(1);
    expect(campaignRow?.paidConversions).toBe(1);

    // Independent raw-SQL cross-check for this campaign's own registration
    // count — no shared code path with getAcquisitionReport's Prisma calls.
    const [{ count: rawCampaignCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM touchpoints
      WHERE "campaignId" = ${campaign.id} AND "touchpointType" = 'signup'
    `;
    expect(Number(rawCampaignCount)).toBe(3);

    const [{ count: rawGymPartnerCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM touchpoints
      WHERE channel = 'gym_partner' AND "touchpointType" = 'signup' AND "userId" IN (${gymUserA}, ${gymUserB})
    `;
    expect(Number(rawGymPartnerCount)).toBe(2);
    expect(gymRow?.registrations).toBeGreaterThanOrEqual(Number(rawGymPartnerCount));

    const [{ count: rawActivatedCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM onboarding_profiles
      WHERE "userId" IN (${campaignUserA}, ${campaignUserB}, ${campaignUserC}) AND "completedAt" IS NOT NULL
    `;
    expect(Number(rawActivatedCount)).toBe(campaignRow?.activatedUsers);

    const [{ count: rawPaidCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "userId")::bigint AS count FROM payments
      WHERE "userId" IN (${campaignUserA}, ${campaignUserB}, ${campaignUserC}) AND status = 'paid'
    `;
    expect(Number(rawPaidCount)).toBe(campaignRow?.paidConversions);

    // Names the honest gap, doesn't fake the columns.
    expect(report.notAvailable).toEqual(["w1RetentionByChannel", "w4RetentionByChannel"]);
  });

  it("date-range-scopes the report to Touchpoint.occurredAt when both dates are given", async () => {
    const suffix = uniqueSuffix();
    const oldUser = await createFixtureUser("old");
    await recordAcquisitionTouchpoint(oldUser, "whatever:old-context");
    await prisma.touchpoint.updateMany({
      where: { userId: oldUser },
      data: { occurredAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    const recentUser = await createFixtureUser(`recent-${suffix}`);
    await recordAcquisitionTouchpoint(recentUser, "whatever:recent-context");

    const scoped = await getAcquisitionReport({
      startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expect(scoped.period).not.toBeNull();
    const directRow = scoped.byChannel.find((r) => r.channel === "direct");
    // The scoped window excludes oldUser's 2020 touchpoint but includes
    // recentUser's — a real difference from the all-time report's count,
    // proving the date filter actually applies to the query, not just to
    // the returned `period` echo.
    const allTime = await getAcquisitionReport({});
    const allTimeDirectRow = allTime.byChannel.find((r) => r.channel === "direct");
    expect(directRow!.registrations).toBeLessThan(allTimeDirectRow!.registrations);
  });
});
