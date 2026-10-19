import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Plan prices on a schedule (decisions D8/D18): Basic / Grow / Prime,
 * price changes with a start date, 30 days' notice for an increase on a
 * plan with subscribers, subscribers told in-app, the paid price locked on
 * the subscription, and changes applied when they fall due.
 *
 * Rate limits: 2 admin logins + 1 consumer signup.
 */
describe("Plan price schedule (D8)", () => {
  const app = buildApp();
  const password = "PriceSchedulePass9!";
  const adminIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let financeToken: string;
  let userId: string;
  let userToken: string;

  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

  async function createAdmin(role: string) {
    const admin = await prisma.adminUser.create({
      data: { email: uniqueEmail(`price-${role}`), passwordHash: await hashPassword(password), fullName: `Price ${role}`, role: role as never, status: "active" },
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password });
    expect(login.status).toBe(200);
    return login.body.token as string;
  }

  async function createPlan(priceCents: number, isActive = true) {
    const plan = await prisma.subscriptionPlan.create({
      data: { name: `Grow ${uniqueSuffix()}`, tier: "grow", billingCycle: "monthly", priceCents, isActive },
    });
    planIds.push(plan.id);
    return plan;
  }

  beforeAll(async () => {
    superToken = await createAdmin("super_admin");
    financeToken = await createAdmin("finance");
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("price-sub"), password: "SomePassword1!", fullName: "Price Subscriber" });
    userId = signup.body.user.id;
    userToken = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.approvalRequest.deleteMany({ where: { makerAdminId: { in: adminIds } } });
    await prisma.planPriceChange.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("schedules a new price without changing today's price", async () => {
    const plan = await createPlan(29900);
    const res = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ priceCents: 34900, effectiveFrom: days(2), reason: "New Grow price for new sign-ups" });
    expect(res.status).toBe(201);
    expect(res.body.plan.priceCents).toBe(29900);
    expect(res.body.plan.scheduledPriceChanges).toHaveLength(1);
    expect(res.body.plan.scheduledPriceChanges[0].priceCents).toBe(34900);
  });

  it("refuses a start date in the past", async () => {
    const plan = await createPlan(29900);
    const res = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ priceCents: 34900, effectiveFrom: days(-2) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("start_date_in_past");
  });

  it("needs 30 days' notice to raise the price on a plan with subscribers, and tells them", async () => {
    const plan = await createPlan(29900);
    await prisma.subscription.create({ data: { userId, planId: plan.id, status: "active", priceCents: 29900, renewsAt: new Date(days(20)) } });

    const tooSoon = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ priceCents: 34900, effectiveFrom: days(10) });
    expect(tooSoon.status).toBe(422);
    expect(tooSoon.body.error.code).toBe("notice_too_short");

    const ok = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ priceCents: 34900, effectiveFrom: days(31) });
    expect(ok.status).toBe(201);
    expect(ok.body.plan.scheduledPriceChanges[0].noticeSentAt).not.toBeNull();

    const notices = await prisma.notification.findMany({ where: { userId, title: { contains: "price change" } } });
    expect(notices.length).toBeGreaterThanOrEqual(1);
  });

  it("won't edit the price of a plan people have bought — it must be scheduled", async () => {
    const plan = await createPlan(29900);
    await prisma.subscription.create({ data: { userId, planId: plan.id, status: "canceled", priceCents: 29900 } });
    const res = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ priceCents: 39900 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("use_scheduled_price_change");
  });

  it("applies a change once it is due, and keeps the subscriber's paid price", async () => {
    const plan = await createPlan(29900);
    const sub = await prisma.subscription.create({
      data: { userId, planId: plan.id, status: "canceled", priceCents: 29900 },
    });
    await prisma.planPriceChange.create({
      data: { planId: plan.id, priceCents: 34900, previousCents: 29900, effectiveFrom: new Date(Date.now() - 60_000) },
    });

    const res = await request(app).get("/subscription-plans").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    const listed = res.body.items.find((p: { id: string }) => p.id === plan.id);
    expect(listed.priceCents).toBe(34900);

    const change = await prisma.planPriceChange.findFirstOrThrow({ where: { planId: plan.id } });
    expect(change.status).toBe("applied");
    const kept = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(kept.priceCents).toBe(29900);
  });

  it("shows the upcoming price to users", async () => {
    const plan = await createPlan(59900);
    await prisma.planPriceChange.create({
      data: { planId: plan.id, priceCents: 64900, previousCents: 59900, effectiveFrom: new Date(days(40)) },
    });
    const res = await request(app).get("/subscription-plans").set("Authorization", `Bearer ${userToken}`);
    const listed = res.body.items.find((p: { id: string }) => p.id === plan.id);
    expect(listed.upcomingPrice.priceCents).toBe(64900);
  });

  it("cancels a scheduled change", async () => {
    const plan = await createPlan(29900);
    const made = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ priceCents: 24900, effectiveFrom: days(3) });
    const changeId = made.body.plan.scheduledPriceChanges[0].id as string;
    const res = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes/${changeId}/cancel`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.plan.scheduledPriceChanges).toHaveLength(0);
  });

  it("sends Finance's price change to the Super Admin for approval", async () => {
    const plan = await createPlan(29900);
    const res = await request(app)
      .post(`/admin/plans/${plan.id}/price-changes`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 32900, effectiveFrom: days(5), reason: "Finance proposes a new Grow price" });
    expect(res.status).toBe(202);
    expect(await prisma.planPriceChange.count({ where: { planId: plan.id } })).toBe(0);
  });
});
