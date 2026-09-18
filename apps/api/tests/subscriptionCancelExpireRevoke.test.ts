import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import * as subscriptionsService from "../src/modules/subscriptions/subscriptions.service";

/**
 * Gap §57 (18 Sep 2026) — real cancel-at-period-end policy, the honest
 * lazy-expiry mechanism that backs it, and the real admin force-revoke
 * capability. See subscriptions.service.ts's own doc comments
 * (cancelSubscription/maybeExpireLapsed/revokeSubscription) and
 * adminSubscriptions.routes.ts for the full design each test below
 * exercises for real against Postgres — no mocking.
 */
describe("Subscription cancel-at-period-end, lazy expiry, and admin force-revoke", () => {
  const app = buildApp();
  let planId: string;
  const userIds: string[] = [];
  const adminUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const plan = await prisma.subscriptionPlan.create({
      data: {
        id: `test-plan-${suffix}`,
        tier: "pro",
        name: "Gap 57 Test Plan",
        priceCents: 0,
        billingCycle: "monthly",
        isActive: true,
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { planId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminUserIds } } });
    await prisma.$disconnect();
  });

  async function signupUser(prefix: string) {
    const email = uniqueEmail(prefix);
    const res = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Gap 57 Test User" });
    userIds.push(res.body.user.id as string);
    return { userId: res.body.user.id as string, accessToken: res.body.tokens.accessToken as string };
  }

  it("cancelSubscription() sets cancelAtPeriodEnd:true and leaves status active — not the old immediate 'canceled' flip", async () => {
    const { userId } = await signupUser("cancel-at-period-end");
    await prisma.subscription.create({
      data: { userId, planId, status: "active", renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const canceled = await subscriptionsService.cancelSubscription(userId);
    expect(canceled.status).toBe("active");
    expect(canceled.cancelAtPeriodEnd).toBe(true);

    // Real DB state, not just the in-memory return value.
    const row = await prisma.subscription.findFirstOrThrow({ where: { userId, planId } });
    expect(row.status).toBe("active");
    expect(row.cancelAtPeriodEnd).toBe(true);
  });

  it("cancelSubscription() 409s on a subscription that's already scheduled to cancel", async () => {
    const { userId } = await signupUser("cancel-idempotent");
    await prisma.subscription.create({
      data: { userId, planId, status: "active", cancelAtPeriodEnd: true, renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    await expect(subscriptionsService.cancelSubscription(userId)).rejects.toMatchObject({
      status: 409,
      code: "already_canceling",
    });
  });

  it("cancelSubscription() 404s when there's no actionable subscription to cancel", async () => {
    const { userId } = await signupUser("cancel-none");
    await expect(subscriptionsService.cancelSubscription(userId)).rejects.toMatchObject({
      status: 404,
      code: "no_active_subscription",
    });
  });

  it("lazy expiry: a cancelAtPeriodEnd subscription read past its renewsAt flips to a real DB-persisted 'expired' status", async () => {
    const { userId, accessToken } = await signupUser("lazy-expire");
    await prisma.subscription.create({
      data: {
        userId,
        planId,
        status: "active",
        cancelAtPeriodEnd: true,
        // Already lapsed.
        renewsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // GET /subscriptions/me is the real read path — exercises
    // getSubscriptionForDisplay -> maybeExpireLapsed end to end.
    const res = await request(app).get("/subscriptions/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe("expired");

    const row = await prisma.subscription.findFirstOrThrow({ where: { userId, planId } });
    expect(row.status).toBe("expired");
  });

  it("lazy expiry does not fire for a cancelAtPeriodEnd subscription that hasn't lapsed yet", async () => {
    const { userId, accessToken } = await signupUser("lazy-not-yet");
    await prisma.subscription.create({
      data: {
        userId,
        planId,
        status: "active",
        cancelAtPeriodEnd: true,
        renewsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app).get("/subscriptions/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe("active");
    expect(res.body.subscription.cancelAtPeriodEnd).toBe(true);
  });

  describe("admin force-revoke", () => {
    const adminPassword = "AdminOnlyPass9!";
    let financeAdminEmail: string;
    let supportAdminEmail: string;

    beforeAll(async () => {
      const passwordHash = await hashPassword(adminPassword);

      const financeAdmin = await prisma.adminUser.create({
        data: {
          email: uniqueEmail("admin-finance-revoke"),
          passwordHash,
          fullName: "Finance Role Admin (revoke test)",
          role: "finance",
          status: "active",
        },
      });
      financeAdminEmail = financeAdmin.email;

      // "support" holds no `commerce` module grant at all (see
      // PERMISSION_MATRIX) — the real, deliberate 403 case.
      const supportAdmin = await prisma.adminUser.create({
        data: {
          email: uniqueEmail("admin-support-revoke"),
          passwordHash,
          fullName: "Support Role Admin (revoke test)",
          role: "support",
          status: "active",
        },
      });
      supportAdminEmail = supportAdmin.email;

      adminUserIds.push(financeAdmin.id, supportAdmin.id);
    });

    async function adminToken(email: string): Promise<string> {
      const res = await request(app).post("/admin/auth/login").send({ email, password: adminPassword });
      expect(res.status).toBe(200);
      return res.body.token as string;
    }

    it("403s an admin role with no commerce:approve grant (support)", async () => {
      const { userId } = await signupUser("revoke-403");
      const subscription = await prisma.subscription.create({
        data: { userId, planId, status: "active", renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
      const token = await adminToken(supportAdminEmail);

      const res = await request(app)
        .post(`/admin/subscriptions/${subscription.id}/revoke`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Testing the permission gate itself" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");

      const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
      expect(row.status).toBe("active");
    });

    it("a real commerce:approve role (finance) can force-revoke, and it lands a real audit row", async () => {
      const { userId } = await signupUser("revoke-success");
      const subscription = await prisma.subscription.create({
        data: { userId, planId, status: "active", renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
      const token = await adminToken(financeAdminEmail);

      const res = await request(app)
        .post(`/admin/subscriptions/${subscription.id}/revoke`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Confirmed chargeback — Razorpay dispute #12345" });

      expect(res.status).toBe(200);
      expect(res.body.subscription.status).toBe("revoked");
      expect(res.body.subscription.revokedReason).toBe("Confirmed chargeback — Razorpay dispute #12345");

      const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
      expect(row.status).toBe("revoked");
      expect(row.revokedAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "Subscription", entityId: subscription.id, action: "subscription.revoked" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as Record<string, unknown> | null)?.reason).toBe(
        "Confirmed chargeback — Razorpay dispute #12345",
      );
    });

    it("rejects a reason under the 10-character minimum (400)", async () => {
      const { userId } = await signupUser("revoke-bad-reason");
      const subscription = await prisma.subscription.create({
        data: { userId, planId, status: "active", renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
      const token = await adminToken(financeAdminEmail);

      const res = await request(app)
        .post(`/admin/subscriptions/${subscription.id}/revoke`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "short" });

      expect(res.status).toBe(400);

      const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
      expect(row.status).toBe("active");
    });

    it("409s revoking an already-revoked subscription", async () => {
      const { userId } = await signupUser("revoke-twice");
      const subscription = await prisma.subscription.create({
        data: {
          userId,
          planId,
          status: "revoked",
          revokedAt: new Date(),
          revokedReason: "Already revoked before this test",
        },
      });
      const token = await adminToken(financeAdminEmail);

      const res = await request(app)
        .post(`/admin/subscriptions/${subscription.id}/revoke`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Trying to revoke it again" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("already_revoked");
    });
  });
});
