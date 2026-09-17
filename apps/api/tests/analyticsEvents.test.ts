import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { trackEvent } from "../src/lib/analytics";

/**
 * Product-analytics events (R1 U7, 15 Sep 2026) — real, Postgres-backed
 * coverage for the one shared `trackEvent()` helper
 * (apps/api/src/lib/analytics.ts) every domain call site funnels through,
 * plus a representative sample of real call sites end to end (rather than
 * re-testing every one of the ~20 individually — each is a one-line,
 * clearly-typed `trackEvent(...)` call at an already-tested mutation, so
 * the real risk surface is `trackEvent()` itself and the read/write
 * endpoints around it).
 *
 * Sample chosen: Check-In (progress.service.ts's `submitCheckIn`) — no AI
 * mocking needed (unlike plans/nutrition), so this exercises a real,
 * complete server-side call site with no extra setup. The client-facing
 * `POST /analytics-events` endpoint and the admin read endpoint are each
 * covered directly.
 */
describe("Product-analytics events", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("analytics");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Analytics Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.analyticsEvent.deleteMany({ where: { userId } });
    await prisma.checkIn.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("trackEvent() writes a real row with name/entityIds/ruleId/metadata", async () => {
    await trackEvent(
      userId,
      "test.harness.event",
      { widgetId: "w-1", gizmoId: null },
      { ruleId: "BR-TEST-001", metadata: { note: "unit-level trackEvent coverage" } },
    );

    const rows = await prisma.analyticsEvent.findMany({ where: { userId, name: "test.harness.event" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].entityIds).toEqual({ widgetId: "w-1", gizmoId: null });
    expect(rows[0].ruleId).toBe("BR-TEST-001");
    expect(rows[0].metadata).toEqual({ note: "unit-level trackEvent coverage" });
    expect(rows[0].occurredAt).toBeInstanceOf(Date);
  });

  it("trackEvent() with no entityIds/opts still writes a real row (both are optional)", async () => {
    await trackEvent(userId, "test.harness.minimal");

    const rows = await prisma.analyticsEvent.findMany({ where: { userId, name: "test.harness.minimal" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].entityIds).toBeNull();
    expect(rows[0].ruleId).toBeNull();
    expect(rows[0].metadata).toBeNull();
  });

  it("a real server-side call site (submitCheckIn) lands its own checkin.completed row with the real CheckIn id", async () => {
    const res = await request(app)
      .post("/check-ins")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "daily", energy: 4, soreness: 2, adherence: 5 });
    expect(res.status).toBe(201);
    const checkInId = res.body.id;

    const rows = await prisma.analyticsEvent.findMany({ where: { userId, name: "checkin.completed" } });
    expect(rows).toHaveLength(1);
    expect((rows[0].entityIds as Record<string, unknown>).checkInId).toBe(checkInId);
    expect((rows[0].metadata as Record<string, unknown>).period).toBe("daily");
  });

  it("POST /analytics-events (client-facing) tracks one of the real closed-enum client-only events", async () => {
    const res = await request(app)
      .post("/analytics-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "assessment.resumed", entityIds: { draftScreen: "Goals" }, metadata: { lastScreen: "Goals" } });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ tracked: true });

    const rows = await prisma.analyticsEvent.findMany({ where: { userId, name: "assessment.resumed" } });
    expect(rows).toHaveLength(1);
    expect((rows[0].entityIds as Record<string, unknown>).draftScreen).toBe("Goals");
  });

  it("POST /analytics-events rejects a name outside the real closed client-only enum", async () => {
    const res = await request(app)
      .post("/analytics-events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "not.a.real.client.event" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("POST /analytics-events 401s without auth", async () => {
    const res = await request(app).post("/analytics-events").send({ name: "assessment.resumed" });
    expect(res.status).toBe(401);
  });

  describe("GET /admin/analytics-events (read path)", () => {
    const adminPassword = "AdminAnalyticsPass9!";
    let analyticsAdminEmail: string;
    let supportAdminEmail: string;
    let adminUserIds: string[] = [];

    beforeAll(async () => {
      const passwordHash = await hashPassword(adminPassword);
      analyticsAdminEmail = uniqueEmail("admin-analytics");
      const analyticsAdmin = await prisma.adminUser.create({
        data: { email: analyticsAdminEmail, passwordHash, fullName: "Analytics Role Admin", role: "analytics", status: "active" },
      });
      supportAdminEmail = uniqueEmail("admin-support-noaccess");
      const supportAdmin = await prisma.adminUser.create({
        data: { email: supportAdminEmail, passwordHash, fullName: "Support Role Admin (no analytics grant)", role: "support", status: "active" },
      });
      adminUserIds = [analyticsAdmin.id, supportAdmin.id];
    });

    afterAll(async () => {
      await prisma.adminUser.deleteMany({ where: { id: { in: adminUserIds } } });
    });

    it("a real 'analytics' role admin can read back the tracked rows, most recent first", async () => {
      const loginRes = await request(app).post("/admin/auth/login").send({ email: analyticsAdminEmail, password: adminPassword });
      expect(loginRes.status).toBe(200);
      const adminToken = loginRes.body.token;

      const res = await request(app)
        .get("/admin/analytics-events")
        .query({ userId })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBeGreaterThanOrEqual(4);
      expect(res.body.entries[0].userEmail).toBeTruthy();
      expect(typeof res.body.totalCount).toBe("number");
      expect(res.body.truncated).toBe(false);
      const names = res.body.entries.map((e: { name: string }) => e.name);
      expect(names).toContain("checkin.completed");
    });

    it("a 'support' role admin (no analytics grant) is blocked with 403", async () => {
      const loginRes = await request(app).post("/admin/auth/login").send({ email: supportAdminEmail, password: adminPassword });
      expect(loginRes.status).toBe(200);
      const adminToken = loginRes.body.token;

      const res = await request(app).get("/admin/analytics-events").set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it("401s without any admin auth", async () => {
      const res = await request(app).get("/admin/analytics-events");
      expect(res.status).toBe(401);
    });
  });
});
