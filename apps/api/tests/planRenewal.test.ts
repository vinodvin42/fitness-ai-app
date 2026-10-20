import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { subscribe } from "../src/modules/subscriptions/subscriptions.service";

/**
 * Paid plans without autopay (owner, 20 Oct 2026). Payments are one-time, so
 * a paid plan ends when the period paid for ends unless the member renews it;
 * renewing early extends from the current end date; the free plan never ends
 * on its own and can't be used to end a paid plan in one tap; purchase
 * history lists only payments that went through, by item name.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Paid plan renewal and purchase history", () => {
  const app = buildApp();
  const planIds: string[] = [];
  let userId: string;
  let token: string;
  let freePlanId: string;
  let paidPlanId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const me = async () => (await request(app).get("/subscriptions/me").set(auth())).body.subscription;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const free = await prisma.subscriptionPlan.create({ data: { name: `Basic ${suffix}`, tier: "basic", billingCycle: "monthly", priceCents: 0 } });
    const paid = await prisma.subscriptionPlan.create({ data: { name: `Prime ${suffix}`, tier: "prime", billingCycle: "monthly", priceCents: 29900 } });
    freePlanId = free.id;
    paidPlanId = paid.id;
    planIds.push(free.id, paid.id);
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("renewal"), password: "SomePassword1!", fullName: "Renewal Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.$disconnect();
  });

  it("the free plan never ends on its own", async () => {
    const res = await request(app).post("/subscriptions").set(auth()).send({ planId: freePlanId });
    expect(res.status).toBe(201);
    await prisma.subscription.update({ where: { id: res.body.id }, data: { renewsAt: days(-3) } });
    expect((await me()).status).toBe("active");
  });

  it("a paid plan can't be ended in one tap by choosing the free plan", async () => {
    await subscribe(userId, { planId: paidPlanId }, { verifiedPayment: true, paidPriceCents: 29900 });
    const res = await request(app).post("/subscriptions").set(auth()).send({ planId: freePlanId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("paid_plan_active");
    expect((await me()).planId).toBe(paidPlanId);
  });

  it("shows a paid plan as expiring in its last week", async () => {
    const current = await me();
    await prisma.subscription.update({ where: { id: current.id }, data: { renewsAt: days(3) } });
    const after = await me();
    expect(after.status).toBe("active");
    expect(after.displayState).toBe("expiring");
  });

  it("renewing early extends from the current end date, so no days are lost", async () => {
    const before = await me();
    const endsAt = new Date(before.renewsAt);
    await subscribe(userId, { planId: paidPlanId }, { verifiedPayment: true, paidPriceCents: 29900 });
    const after = await me();
    expect(after.id).toBe(before.id);
    const expected = new Date(endsAt.getTime());
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(new Date(after.renewsAt).getTime() - expected.getTime())).toBeLessThan(5_000);
    expect(after.displayState).toBe("active");
  });

  it("a paid plan ends when the paid period ends", async () => {
    const current = await me();
    await prisma.subscription.update({ where: { id: current.id }, data: { renewsAt: days(-1) } });
    const after = await me();
    expect(after.status).toBe("expired");
    // ...and then the free plan can be chosen.
    expect((await request(app).post("/subscriptions").set(auth()).send({ planId: freePlanId })).status).toBe(201);
  });

  it("purchase history lists only payments that went through, by item name", async () => {
    const suffix = uniqueSuffix();
    await prisma.payment.createMany({
      data: [
        { userId, purpose: "subscription", referenceId: paidPlanId, amountCents: 29900, providerOrderId: `order_paid_${suffix}`, status: "paid" },
        { userId, purpose: "subscription", referenceId: paidPlanId, amountCents: 29900, providerOrderId: `order_open_${suffix}`, status: "created" },
        { userId, purpose: "subscription", referenceId: paidPlanId, amountCents: 29900, providerOrderId: `order_fail_${suffix}`, status: "failed" },
      ],
    });
    const res = await request(app).get("/checkout/purchases").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual(expect.objectContaining({ status: "paid", itemName: expect.stringMatching(/^Prime /) }));
  });
});
