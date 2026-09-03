import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * requireAdminAuth (middleware/adminAuth.ts) and requirePermission
 * (middleware/adminPermissions.ts), exercised against a real gated route —
 * GET /admin/support-tickets, which requires requirePermission("support",
 * "view"). Per PERMISSION_MATRIX, the "support" role has support:view but
 * the "content" role has none of the support module at all, which is what
 * makes this a real allow/deny pair rather than two roles that both
 * happen to pass.
 *
 * Rate limits: admin login shares `authRateLimit` (10/15min) with consumer
 * POST /auth/login (see auth.test.ts's own comment) — this file makes 3
 * admin-login calls, well under the limit, and never calls consumer login
 * at all.
 */
describe("Admin auth + permissions", () => {
  const app = buildApp();
  const adminPassword = "AdminOnlyPass9!";
  let supportAdminEmail: string;
  let contentAdminEmail: string;
  let adminUserIds: string[] = [];
  let consumerAccessToken: string;
  let consumerEmail: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(adminPassword);

    supportAdminEmail = uniqueEmail("admin-support");
    const supportAdmin = await prisma.adminUser.create({
      data: {
        email: supportAdminEmail,
        passwordHash,
        fullName: "Support Role Admin",
        role: "support",
        status: "active",
      },
    });

    contentAdminEmail = uniqueEmail("admin-content");
    const contentAdmin = await prisma.adminUser.create({
      data: {
        email: contentAdminEmail,
        passwordHash,
        fullName: "Content Role Admin",
        role: "content",
        status: "active",
      },
    });
    adminUserIds = [supportAdmin.id, contentAdmin.id];

    consumerEmail = uniqueEmail("consumer-for-admin-test");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: consumerEmail, password: "SomePassword1!", fullName: "Consumer Not Admin" });
    consumerAccessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: consumerEmail } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminUserIds } } });
    await prisma.$disconnect();
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/admin/support-tickets");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("rejects a malformed/invalid admin token", async () => {
    const res = await request(app).get("/admin/support-tickets").set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("rejects a real, valid CONSUMER access token — the two identities are never interchangeable", async () => {
    const res = await request(app)
      .get("/admin/support-tickets")
      .set("Authorization", `Bearer ${consumerAccessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("rejects admin login with an incorrect password", async () => {
    const res = await request(app)
      .post("/admin/auth/login")
      .send({ email: supportAdminEmail, password: "TheWrongPassword1!" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("requirePermission blocks a role with no grant on that module (403)", async () => {
    const loginRes = await request(app)
      .post("/admin/auth/login")
      .send({ email: contentAdminEmail, password: adminPassword });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;

    const res = await request(app).get("/admin/support-tickets").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("requirePermission allows a role that actually holds the grant", async () => {
    const loginRes = await request(app)
      .post("/admin/auth/login")
      .send({ email: supportAdminEmail, password: adminPassword });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;

    const res = await request(app).get("/admin/support-tickets").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.stats).toBeDefined();
  });
});
