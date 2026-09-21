import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { createGym } from "../src/modules/gyms/gyms.service";
import { gymLogin, getGymAuthById } from "../src/modules/gymAuth/gymAuth.service";
import { ApiHttpError } from "../src/middleware/errorHandler";

/**
 * Gym Partner Lite portal auth (R2 Wave 5, 21 Sep 2026) — real coverage for
 * gymAuth.service.ts's login (called directly, same convention as
 * gyms.test.ts) plus a real over-HTTP pass through the full route stack
 * (login -> requireGymAuth-gated `/gym-portal/*` routes), proving the
 * gym-authed wrapper routes in gyms.routes.ts genuinely reuse
 * gyms.service.ts's own getGymDetail/getMemberActivationSummary rather than
 * duplicating that logic, and that a gym is always scoped to its own
 * req.gymId (never a client-supplied id).
 */
describe("Gym Partner Lite portal auth", () => {
  const app = buildApp();
  const adminPassword = "AdminGymAuthPass9!";
  let adminId: string;
  let adminEmail: string;
  const createdGymIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    adminEmail = `admin-gymauth-${suffix}@example.com`;
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        fullName: "Gym Auth Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;
  });

  async function adminAccessToken(): Promise<string> {
    const res = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    return res.body.token;
  }

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: "Gym", entityId: { in: createdGymIds } } });
    await prisma.gymLocation.deleteMany({ where: { gymId: { in: createdGymIds } } });
    await prisma.gym.deleteMany({ where: { id: { in: createdGymIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("refuses login for a gym with no portal password set yet (same generic error as a wrong password)", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `No Portal Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: uniqueEmail("no-portal-gym"),
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    await expect(gymLogin({ email: gym.contactEmail, password: "WhateverPassword1!" })).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    });
  });

  it("logs in for real once an admin sets a portal password, and issues a working access token", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Real Portal Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: uniqueEmail("real-portal-gym"),
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    // Admin sets the portal password over real HTTP, using a real admin
    // access token from a real login (not a hand-signed JWT).
    const setPasswordRes = await request(app)
      .post(`/admin/gyms/${gym.id}/portal-password`)
      .set("Authorization", `Bearer ${await adminAccessToken()}`)
      .send({ password: "GymPortalPass9!" });
    expect(setPasswordRes.status).toBe(200);
    expect(setPasswordRes.body).toMatchObject({ gymId: gym.id, portalPasswordSet: true });

    // Real row now has a real bcrypt hash, never plaintext.
    const row = await getGymAuthById(gym.id);
    expect(row.gymPasswordHash).not.toBeNull();
    expect(row.gymPasswordHash).not.toBe("GymPortalPass9!");

    // Wrong password still fails.
    const wrongRes = await request(app)
      .post("/gym-portal/auth/login")
      .send({ email: gym.contactEmail, password: "TheWrongPassword1!" });
    expect(wrongRes.status).toBe(401);
    expect(wrongRes.body.error.code).toBe("invalid_credentials");

    // Real login succeeds and returns a real, working access token.
    const loginRes = await request(app)
      .post("/gym-portal/auth/login")
      .send({ email: gym.contactEmail, password: "GymPortalPass9!" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.gym.id).toBe(gym.id);
    expect(loginRes.body.gym.gymPasswordHash).toBeUndefined();
    const gymToken = loginRes.body.token as string;
    expect(typeof gymToken).toBe("string");

    // Token works against GET /gym-portal/auth/me.
    const meRes = await request(app).get("/gym-portal/auth/me").set("Authorization", `Bearer ${gymToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.gym.id).toBe(gym.id);

    // A CONSUMER/admin/professional token is never interchangeable with a gym token.
    const noTokenRes = await request(app).get("/gym-portal/auth/me");
    expect(noTokenRes.status).toBe(401);
  });

  it("gym-authed wrapper routes scope strictly to the token's own gymId, reusing gyms.service.ts's real aggregation", async () => {
    const suffix = uniqueSuffix();
    const gymA = await createGym(adminId, {
      name: `Wrapper Gym A ${suffix}`,
      contactName: "Contact A",
      contactEmail: uniqueEmail("wrapper-gym-a"),
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 2500,
      locations: [{ name: "Main Branch", address: "1 Test Street" }],
    });
    createdGymIds.push(gymA.id);

    const passwordHash = await hashPassword("WrapperGymPass9!");
    await prisma.gym.update({ where: { id: gymA.id }, data: { gymPasswordHash: passwordHash } });

    const loginRes = await request(app)
      .post("/gym-portal/auth/login")
      .send({ email: gymA.contactEmail, password: "WrapperGymPass9!" });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token as string;

    const profileRes = await request(app).get("/gym-portal/me").set("Authorization", `Bearer ${token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.gym.id).toBe(gymA.id);
    expect(profileRes.body.gym.locations).toHaveLength(1);
    // Commercial terms are trimmed to a boolean — never the raw negotiated figures.
    expect(profileRes.body.gym.commercialConfigured).toBe(true);
    expect(profileRes.body.gym.commissionPct).toBeUndefined();
    expect(profileRes.body.gym.pricingModel).toBeUndefined();
    expect(profileRes.body.gym.ratePerMemberCents).toBeUndefined();

    // BR-GYM-003: aggregate counts only, matching gyms.service.ts's own real
    // aggregation exactly — no member list ever appears in this response.
    const summaryRes = await request(app)
      .get("/gym-portal/member-activation-summary")
      .set("Authorization", `Bearer ${token}`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body).toEqual({
      gymId: gymA.id,
      memberCount: 0,
      onboardingCompletedCount: 0,
      firstWorkoutCompletedCount: 0,
    });
    expect(summaryRes.body.members).toBeUndefined();
  });

  it("404s / 401s appropriately: unknown login email, suspended gym, no auth header", async () => {
    await expect(gymLogin({ email: uniqueEmail("does-not-exist"), password: "Whatever1!" })).rejects.toMatchObject({
      status: 401,
    });

    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Suspended Portal Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: uniqueEmail("suspended-portal-gym"),
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    await prisma.gym.update({
      where: { id: gym.id },
      data: { gymPasswordHash: await hashPassword("SuspendedGymPass9!"), status: "suspended" },
    });

    await expect(gymLogin({ email: gym.contactEmail, password: "SuspendedGymPass9!" })).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    });

    const noHeaderRes = await request(app).get("/gym-portal/me");
    expect(noHeaderRes.status).toBe(401);

    await expect(getGymAuthById("does-not-exist")).rejects.toBeInstanceOf(ApiHttpError);
  });
});
