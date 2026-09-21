import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Consent Management admin read view (Wave 4, 20 Sep 2026) — real,
 * read-only `GET /admin/users/:id/consents`, a thin wrapper around
 * `users.service.ts#listConsents` (see adminUsers.service.ts's own
 * `listUserConsents` doc comment for the full design). Covers:
 *  - Real fixture data: grant/revoke a few consents via the existing
 *    real user-facing `PATCH /users/me/consents`, then confirm the admin
 *    endpoint returns the exact correct state — not just a 200.
 *  - A consent type never touched reads as `granted: false, updatedAt:
 *    null` ("never decided", not "declined") — same contract
 *    listConsents() itself guarantees.
 *  - Gated by `sensitiveData: view` (401 with no auth, 403 for a role
 *    that doesn't hold it).
 *  - 404 for a user id that doesn't exist.
 */
describe("Consent Management admin read view: GET /admin/users/:id/consents", () => {
  const app = buildApp();
  const adminPassword = "AdminConsentsPass9!";
  let superAdminEmail: string;
  const cleanupUserIds: string[] = [];
  const cleanupAdminIds: string[] = [];

  beforeAll(async () => {
    superAdminEmail = uniqueEmail("admin-consents-super");
    const superAdmin = await prisma.adminUser.create({
      data: {
        email: superAdminEmail,
        passwordHash: await hashPassword(adminPassword),
        fullName: "Consents Super Admin",
        role: "super_admin",
        status: "active",
      },
    });
    cleanupAdminIds.push(superAdmin.id);
  });

  afterAll(async () => {
    if (cleanupUserIds.length) {
      await prisma.consent.deleteMany({ where: { userId: { in: cleanupUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    }
    await prisma.adminUser.deleteMany({ where: { id: { in: cleanupAdminIds } } });
    await prisma.$disconnect();
  });

  async function loginSuperAdmin(): Promise<string> {
    const res = await request(app).post("/admin/auth/login").send({ email: superAdminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    return res.body.token;
  }

  it("returns real, correct per-type consent state after real grant/revoke calls, confirmed against fixture data", async () => {
    const email = uniqueEmail("consents-fixture");
    const password = "SomePassword1!";
    const signupRes = await request(app).post("/auth/signup").send({ email, password, fullName: "Consent Fixture User" });
    const userId = signupRes.body.user.id;
    cleanupUserIds.push(userId);
    const userToken = signupRes.body.tokens.accessToken;

    // Real user-facing writes — the same PATCH the mobile Privacy Settings
    // screen calls. Grant marketing_emails, then explicitly revoke it
    // (an update to the SAME row, per the real unique constraint) to
    // prove the admin read reflects the LATEST state, not just "any" row.
    await request(app)
      .patch("/users/me/consents")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ type: "marketing_emails", granted: true });
    const revokeRes = await request(app)
      .patch("/users/me/consents")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ type: "marketing_emails", granted: false });
    expect(revokeRes.status).toBe(200);

    const grantHealthRes = await request(app)
      .patch("/users/me/consents")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ type: "health_data_processing", granted: true });
    expect(grantHealthRes.status).toBe(200);

    // data_analytics is deliberately left untouched — must read as
    // `granted: false, updatedAt: null` ("never decided"), not fabricated.

    const adminToken = await loginSuperAdmin();

    const noAuthRes = await request(app).get(`/admin/users/${userId}/consents`);
    expect(noAuthRes.status).toBe(401);

    const res = await request(app).get(`/admin/users/${userId}/consents`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.userEmail).toBe(email);
    expect(res.body.consents).toHaveLength(3);

    const byType: Record<string, { granted: boolean; updatedAt: string | null }> = {};
    for (const c of res.body.consents) byType[c.type] = c;

    expect(byType.marketing_emails.granted).toBe(false);
    expect(byType.marketing_emails.updatedAt).not.toBeNull();

    expect(byType.health_data_processing.granted).toBe(true);
    expect(byType.health_data_processing.updatedAt).not.toBeNull();

    expect(byType.data_analytics.granted).toBe(false);
    expect(byType.data_analytics.updatedAt).toBeNull();

    // Cross-checked directly against the DB row, not just the API's own
    // echo of what it wrote.
    const dbRow = await prisma.consent.findUnique({ where: { userId_type: { userId, type: "health_data_processing" } } });
    expect(dbRow?.granted).toBe(true);
  });

  it("404s for a user id that doesn't exist", async () => {
    const adminToken = await loginSuperAdmin();
    const res = await request(app)
      .get("/admin/users/00000000-0000-0000-0000-000000000000/consents")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("403s for an admin role without sensitiveData:view", async () => {
    const email = uniqueEmail("consents-limited-admin");
    const limitedPassword = "LimitedAdminPass9!";
    const limitedAdmin = await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await hashPassword(limitedPassword),
        fullName: "Limited Role Admin",
        // "content" holds no sensitiveData grant in PERMISSION_MATRIX —
        // only super_admin does (see adminPermissions.ts) — same
        // "role without the module" precedent other permission tests in
        // this suite use.
        role: "content",
        status: "active",
      },
    });
    cleanupAdminIds.push(limitedAdmin.id);

    const loginRes = await request(app).post("/admin/auth/login").send({ email, password: limitedPassword });
    expect(loginRes.status).toBe(200);
    const limitedToken = loginRes.body.token;

    const userEmail = uniqueEmail("consents-target-for-403");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Target User" });
    const userId = signupRes.body.user.id;
    cleanupUserIds.push(userId);

    const res = await request(app).get(`/admin/users/${userId}/consents`).set("Authorization", `Bearer ${limitedToken}`);
    expect(res.status).toBe(403);
  });
});
