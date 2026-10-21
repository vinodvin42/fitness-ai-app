import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { cancelSubscription } from "../src/modules/subscriptions/subscriptions.service";

/**
 * Owner, 21 Oct 2026: "basic plan never expire". Joining the free plan gives
 * no end date, it can't be set to cancel, and an older Basic that was set to
 * cancel (or already expired through that) reads back as a plain,
 * never-ending Basic, with an audit entry.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Basic never ends", () => {
  const app = buildApp();
  const planIds: string[] = [];
  let userId: string;
  let token: string;
  let freePlanId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const me = async () => (await request(app).get("/subscriptions/me").set(auth())).body.subscription;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const free = await prisma.subscriptionPlan.create({ data: { name: `Basic ${suffix}`, tier: "basic", billingCycle: "monthly", priceCents: 0 } });
    freePlanId = free.id;
    planIds.push(free.id);
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("basic-never-ends"), password: "SomePassword1!", fullName: "Basic Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.$disconnect();
  });

  it("B1 joining Basic gives no end date", async () => {
    const res = await request(app).post("/subscriptions").set(auth()).send({ planId: freePlanId });
    expect(res.status).toBe(201);
    expect(res.body.renewsAt).toBeNull();
    const sub = await me();
    expect(sub.status).toBe("active");
    expect(sub.renewsAt).toBeNull();
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect(sub.displayState).toBe("active");
  });

  it("B2 Basic can't be set to cancel", async () => {
    await expect(cancelSubscription(userId)).rejects.toMatchObject({ status: 409, code: "free_plan_never_ends" });
    const res = await request(app).post("/subscriptions/cancel").set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("free_plan_never_ends");
  });

  it("B3 an older Basic set to cancel reads back as never-ending, and is fixed in the database", async () => {
    const row = await prisma.subscription.findFirstOrThrow({ where: { userId, planId: freePlanId } });
    await prisma.subscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: true, renewsAt: days(19) } });

    const sub = await me();
    expect(sub.status).toBe("active");
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect(sub.renewsAt).toBeNull();
    expect(sub.displayState).toBe("active");

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.cancelAtPeriodEnd).toBe(false);
    expect(after.renewsAt).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Subscription", entityId: row.id, action: "subscription.free_plan_restored" },
    });
    expect(audit).not.toBeNull();
  });

  it("B4 a Basic that was set to cancel and has passed its old end date is not expired", async () => {
    const row = await prisma.subscription.findFirstOrThrow({ where: { userId, planId: freePlanId } });
    await prisma.subscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: true, renewsAt: days(-2) } });
    const sub = await me();
    expect(sub.status).toBe("active");
    expect(sub.renewsAt).toBeNull();
  });

  it("B5 a Basic that already expired that way is active again", async () => {
    const row = await prisma.subscription.findFirstOrThrow({ where: { userId, planId: freePlanId } });
    await prisma.subscription.update({ where: { id: row.id }, data: { status: "expired", cancelAtPeriodEnd: true, renewsAt: days(-5) } });
    const sub = await me();
    expect(sub.status).toBe("active");
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("active");
  });

  it("B6 an admin-revoked Basic stays revoked", async () => {
    const row = await prisma.subscription.findFirstOrThrow({ where: { userId, planId: freePlanId } });
    await prisma.subscription.update({ where: { id: row.id }, data: { status: "revoked", revokedAt: new Date(), revokedReason: "test" } });
    expect((await me()).status).toBe("revoked");
  });
});
