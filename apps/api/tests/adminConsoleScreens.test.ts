import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Admin screens added Oct 2026 over data that already existed:
 * 06.01 Subscriptions list, 11.02 AI Usage, 12.07 Notifications overview,
 * 12.08 Platform Settings. Real Postgres, no mocked Prisma.
 */
describe("Admin console: subscriptions, AI usage, notifications, platform settings", () => {
  const app = buildApp();
  const password = "ConsoleScreensAdm9!";
  let superAuth = "";
  let supportAuth = "";
  const adminIds: string[] = [];
  let userId = "";
  let planId = "";
  let subscriptionId = "";
  const userEmail = uniqueEmail("cs-user");

  async function adminLogin(role: string): Promise<string> {
    const email = uniqueEmail(`cs-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: `CS ${role}`, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    return `Bearer ${login.body.token}`;
  }

  beforeAll(async () => {
    superAuth = await adminLogin("super_admin");
    supportAuth = await adminLogin("support");
    const u = await request(app).post("/auth/signup").send({ email: userEmail, password: "SomePassword1!", fullName: "Console Screens User" });
    userId = u.body.user.id;
    const plan = await prisma.subscriptionPlan.create({
      data: { tier: "grow", name: `CS Grow ${Date.now()}`, priceCents: 49900, billingCycle: "monthly" },
    });
    planId = plan.id;
    const sub = await prisma.subscription.create({
      data: { userId, planId, status: "active", priceCents: 39900, renewsAt: new Date(Date.now() + 20 * 86_400_000) },
    });
    subscriptionId = sub.id;

    const now = Date.now();
    await prisma.aiCoachMessage.createMany({
      data: [
        { userId, role: "user", content: "q1", createdAt: new Date(now - 60_000) },
        { userId, role: "assistant", content: "a1", sources: [{ kind: "goals", label: "Your goals", value: "x" }], createdAt: new Date(now - 50_000) },
        { userId, role: "user", content: "q2", createdAt: new Date(now - 40_000) },
        { userId, role: "assistant", content: "a2", createdAt: new Date(now - 30_000) },
        { userId, role: "user", content: "q3", failed: true, createdAt: new Date(now - 20_000) },
      ],
    });

    await prisma.notification.createMany({
      data: [
        { userId, kind: "workout", title: "t", body: "b", readAt: new Date() },
        { userId, kind: "workout", title: "t", body: "b" },
        { userId, kind: "billing", title: "t", body: "b" },
      ],
    });
    await prisma.pushToken.create({ data: { userId, token: `ExponentPushToken[cs-${Date.now()}]`, platform: "android" } });
    await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, marketing: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
      update: { marketing: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  describe("06.01 Subscriptions list", () => {
    it("lists a subscription with its user, plan and locked price", async () => {
      const res = await request(app).get("/admin/subscriptions").query({ search: userEmail }).set("Authorization", superAuth);
      expect(res.status).toBe(200);
      const row = res.body.subscriptions.find((s: { id: string }) => s.id === subscriptionId);
      expect(row).toMatchObject({
        status: "active",
        user: { id: userId, email: userEmail },
        plan: { id: planId, tier: "grow", billingCycle: "monthly", priceCents: 49900 },
        priceCents: 39900,
        priceLocked: true,
      });
      expect(res.body.counts.active).toBeGreaterThanOrEqual(1);
      expect(row.user).toHaveProperty("countryCode");
      // Country is real now: an "active by country" breakdown, nothing named as missing.
      expect(Array.isArray(res.body.byCountry)).toBe(true);
      expect(res.body.byCountry.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBeGreaterThanOrEqual(1);
      expect(res.body.notAvailable).not.toContain("country");
    });

    it("filters by status, tier and cycle; rejects an unknown status", async () => {
      const canceled = await request(app).get("/admin/subscriptions").query({ search: userEmail, status: "canceled" }).set("Authorization", superAuth);
      expect(canceled.body.subscriptions).toHaveLength(0);
      const prime = await request(app).get("/admin/subscriptions").query({ search: userEmail, tier: "prime" }).set("Authorization", superAuth);
      expect(prime.body.subscriptions).toHaveLength(0);
      const monthly = await request(app).get("/admin/subscriptions").query({ search: userEmail, billingCycle: "monthly" }).set("Authorization", superAuth);
      expect(monthly.body.subscriptions.map((s: { id: string }) => s.id)).toContain(subscriptionId);
      const bad = await request(app).get("/admin/subscriptions").query({ status: "nonsense" }).set("Authorization", superAuth);
      expect(bad.status).toBe(400);
    });

    it("is closed to a role without commerce access", async () => {
      const res = await request(app).get("/admin/subscriptions").set("Authorization", supportAuth);
      expect(res.status).toBe(403);
    });
  });

  describe("11.02 AI Usage", () => {
    it("counts questions, answers, unanswered and personalised replies, with a full daily series", async () => {
      const res = await request(app).get("/admin/ai-ops/usage").query({ days: 7 }).set("Authorization", superAuth);
      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      expect(res.body.series).toHaveLength(7);
      expect(res.body.totals.questions).toBeGreaterThanOrEqual(3);
      expect(res.body.totals.answered).toBeGreaterThanOrEqual(2);
      expect(res.body.totals.unanswered).toBeGreaterThanOrEqual(1);
      expect(res.body.totals.personalised).toBeGreaterThanOrEqual(1);
      expect(res.body.totals.activeUsers).toBeGreaterThanOrEqual(1);
      const today = res.body.series[res.body.series.length - 1];
      expect(today.questions).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(res.body)).not.toContain("q1");
      expect(res.body.notAvailable).toEqual(expect.arrayContaining(["aiTokens", "aiCost"]));
    });

    it("accepts only 7, 30 or 90 days, and is closed to a role without analytics", async () => {
      expect((await request(app).get("/admin/ai-ops/usage").query({ days: 14 }).set("Authorization", superAuth)).status).toBe(400);
      expect((await request(app).get("/admin/ai-ops/usage").set("Authorization", supportAuth)).status).toBe(403);
    });
  });

  describe("12.07 Notifications overview", () => {
    it("reports in-app counts by kind, push devices as registration only, and saved preferences", async () => {
      const res = await request(app).get("/admin/notifications/overview").set("Authorization", superAuth);
      expect(res.status).toBe(200);
      const workout = res.body.inApp.find((k: { kind: string }) => k.kind === "workout");
      expect(workout.created).toBeGreaterThanOrEqual(2);
      expect(workout.read).toBeGreaterThanOrEqual(1);
      expect(res.body.channels).toEqual(expect.arrayContaining([{ channel: "push", status: "registration_only" }]));
      expect(res.body.push.devices).toBeGreaterThanOrEqual(1);
      expect(res.body.preferences.usersWithSavedSettings).toBeGreaterThanOrEqual(1);
      expect(res.body.preferences.quietHoursSet).toBeGreaterThanOrEqual(1);
      expect(res.body.notAvailable).toContain("pushSending");
    });

    it("is closed to a role without admin access", async () => {
      expect((await request(app).get("/admin/notifications/overview").set("Authorization", supportAuth)).status).toBe(403);
    });
  });

  describe("12.08 Platform Settings", () => {
    it("shows the effective settings and never a secret", async () => {
      const res = await request(app).get("/admin/platform-settings").set("Authorization", superAuth);
      expect(res.status).toBe(200);
      expect(res.body.general.environment).toBe("test");
      expect(typeof res.body.security.approvalExpiryDays).toBe("number");
      expect(typeof res.body.aiCoach.isEnabled).toBe("boolean");
      const body = JSON.stringify(res.body);
      for (const secret of [process.env.JWT_ACCESS_SECRET, process.env.ADMIN_JWT_SECRET, process.env.DATABASE_URL, process.env.TWO_FACTOR_ENCRYPTION_KEY]) {
        if (secret) expect(body).not.toContain(secret);
      }
    });

    it("is closed to a role without admin access", async () => {
      expect((await request(app).get("/admin/platform-settings").set("Authorization", supportAuth)).status).toBe(403);
    });
  });
});
