import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { generateUniqueGymInviteCode } from "../src/modules/gyms/gyms.service";

/**
 * Global cross-entity admin search (R1 Wave 6, 22 Sep 2026) — real HTTP
 * coverage of GET /admin/search over adminSearch.service.ts#globalSearch.
 * Same "real createApp(), real Postgres, no mocks" convention as every
 * other admin test file (see adminAuthPermissions.test.ts). Uses a single,
 * distinguishable per-run suffix on every fixture name so prefix-matching
 * assertions can't collide with unrelated rows already in this shared dev/
 * CI database.
 */
describe("Global admin search — GET /admin/search", () => {
  const app = buildApp();
  const adminPassword = "AdminSearchPass9!";
  let suffix: string;

  let superAdminEmail: string;
  let supportAdminEmail: string; // users:view only — no professionals/gyms/growth
  const adminUserIds: string[] = [];

  let userId: string;
  let professionalId: string;
  let gymId: string;
  let campaignId: string;
  let sourceId: string;

  beforeAll(async () => {
    suffix = uniqueSuffix();
    const passwordHash = await hashPassword(adminPassword);

    superAdminEmail = uniqueEmail("search-super-admin");
    const superAdmin = await prisma.adminUser.create({
      data: { email: superAdminEmail, passwordHash, fullName: "Search Super Admin", role: "super_admin", status: "active" },
    });
    supportAdminEmail = uniqueEmail("search-support-admin");
    const supportAdmin = await prisma.adminUser.create({
      data: { email: supportAdminEmail, passwordHash, fullName: "Search Support Admin", role: "support", status: "active" },
    });
    adminUserIds.push(superAdmin.id, supportAdmin.id);

    // Distinguishable, prefix-matchable fixtures across all four searched
    // entity types, all sharing the same run-unique prefix.
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(`zenquartz-${suffix}`),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Zenquartz Findme ${suffix}`,
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const professional = await prisma.professional.create({
      data: {
        email: uniqueEmail(`zenquartz-pro-${suffix}`),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Zenquartz Coach ${suffix}`,
      },
    });
    professionalId = professional.id;

    const gym = await prisma.gym.create({
      data: {
        name: `Zenquartz Gym ${suffix}`,
        contactName: "Contact Person",
        contactEmail: uniqueEmail(`zenquartz-gym-${suffix}`),
        inviteCode: await generateUniqueGymInviteCode(),
      },
    });
    gymId = gym.id;

    const source = await prisma.acquisitionSource.upsert({
      where: { channel: "organic" },
      create: { channel: "organic", label: "Organic" },
      update: {},
    });
    sourceId = source.id;
    const campaign = await prisma.campaign.create({
      data: {
        sourceId,
        name: `Zenquartz Campaign ${suffix}`,
        linkCode: `ZQ-${suffix}`.slice(0, 40),
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.gym.deleteMany({ where: { id: gymId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminUserIds } } });
    await prisma.$disconnect();
  });

  async function loginAs(email: string): Promise<string> {
    const res = await request(app).post("/admin/auth/login").send({ email, password: adminPassword });
    expect(res.status).toBe(200);
    return res.body.token;
  }

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/admin/search").query({ q: "anything" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing/empty q", async () => {
    const token = await loginAs(superAdminEmail);
    const res = await request(app).get("/admin/search").set("Authorization", `Bearer ${token}`).query({ q: "" });
    expect(res.status).toBe(400);
  });

  it("a super_admin querying a broad common prefix gets all four fixture types back at once", async () => {
    const token = await loginAs(superAdminEmail);
    const res = await request(app).get("/admin/search").set("Authorization", `Bearer ${token}`).query({ q: "Zenquartz" });
    expect(res.status).toBe(200);
    expect(res.body.query).toBe("Zenquartz");

    const byType = (t: string) => res.body.results.filter((r: { type: string }) => r.type === t);
    expect(byType("user").some((r: { id: string }) => r.id === userId)).toBe(true);
    expect(byType("professional").some((r: { id: string }) => r.id === professionalId)).toBe(true);
    expect(byType("gym").some((r: { id: string }) => r.id === gymId)).toBe(true);
    expect(byType("campaign").some((r: { id: string }) => r.id === campaignId)).toBe(true);
  });

  it("prefix-matches a specific fixture exactly (user, professional, gym, campaign all found by their own distinguishing prefix)", async () => {
    const token = await loginAs(superAdminEmail);

    const userRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Findme ${suffix}` });
    expect(userRes.status).toBe(200);
    expect(userRes.body.results).toHaveLength(1);
    expect(userRes.body.results[0]).toMatchObject({ id: userId, type: "user", path: `/users/${userId}` });

    const proRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Coach ${suffix}` });
    expect(proRes.body.results).toHaveLength(1);
    expect(proRes.body.results[0]).toMatchObject({ id: professionalId, type: "professional", path: `/professionals/${professionalId}` });

    const gymRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Gym ${suffix}` });
    expect(gymRes.body.results).toHaveLength(1);
    expect(gymRes.body.results[0]).toMatchObject({ id: gymId, type: "gym", path: `/gyms/${gymId}` });

    const campaignRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Campaign ${suffix}` });
    expect(campaignRes.body.results).toHaveLength(1);
    expect(campaignRes.body.results[0]).toMatchObject({ id: campaignId, type: "campaign" });
    expect(campaignRes.body.results[0].path).toContain("/growth/campaigns");

    // An exact id match works too, regardless of name prefix.
    const idRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: gymId });
    expect(idRes.body.results.some((r: { id: string }) => r.id === gymId)).toBe(true);
  });

  it("a query matching nothing returns a real empty result list, not an error", async () => {
    const token = await loginAs(superAdminEmail);
    const res = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `NoSuchThingExists-${suffix}` });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it("does not match a substring that isn't a prefix (prefix-only, not full-text)", async () => {
    const token = await loginAs(superAdminEmail);
    // "Findme" is a real substring of "Zenquartz Findme <suffix>" but not a
    // prefix — this is the documented scope boundary (prefix/exact only).
    const res = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: "Findme" });
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: { id: string }) => r.id === userId)).toBe(false);
  });

  it("permission-gates entity types: a support-role admin (users:view only) never gets professional/gym/campaign results", async () => {
    const token = await loginAs(supportAdminEmail);

    const userRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Findme ${suffix}` });
    expect(userRes.status).toBe(200);
    expect(userRes.body.results).toHaveLength(1);
    expect(userRes.body.results[0].type).toBe("user");

    const proRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Coach ${suffix}` });
    expect(proRes.status).toBe(200);
    expect(proRes.body.results).toEqual([]); // support role has no professionals:view

    const gymRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Gym ${suffix}` });
    expect(gymRes.body.results).toEqual([]); // support role has no gyms:view

    const campaignRes = await request(app)
      .get("/admin/search")
      .set("Authorization", `Bearer ${token}`)
      .query({ q: `Zenquartz Campaign ${suffix}` });
    expect(campaignRes.body.results).toEqual([]); // support role has no growth:view
  });
});
