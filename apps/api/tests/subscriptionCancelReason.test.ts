import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";

/**
 * Cancel screen (Figma payments/07, 24 Oct 2026): the member can say why
 * they're leaving and add a comment. Both are optional and change nothing
 * about access: the plan still runs to the end of the period.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Subscription cancel reason", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let planId: string;
  let subId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const plan = await prisma.subscriptionPlan.create({
      data: { name: `Prime ${uniqueSuffix()}`, tier: "prime", billingCycle: "monthly", priceCents: 29900 },
    });
    planId = plan.id;
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("cancel-reason"), password: "SomePassword1!", fullName: "Cancel Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
    subId = (await prisma.subscription.create({ data: { userId, planId, status: "active", renewsAt: days(20) } })).id;
  });
  beforeEach(async () => {
    await prisma.subscription.update({
      where: { id: subId },
      data: { cancelAtPeriodEnd: false, cancelReason: null, cancelComment: null, cancelRequestedAt: null },
    });
  });
  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("C1 saves the reason and the trimmed comment; the plan still runs to its end date", async () => {
    const res = await request(app).post("/subscriptions/cancel").set(auth()).send({ reason: "too_expensive", comment: "  Price is high  " });
    expect(res.status).toBe(200);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
    expect(res.body.status).toBe("active");
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    expect(row).toMatchObject({ cancelReason: "too_expensive", cancelComment: "Price is high" });
    expect(row.cancelRequestedAt).toBeInstanceOf(Date);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: subId, action: "subscription.cancel_at_period_end" },
      orderBy: { createdAt: "desc" },
    });
    expect((audit?.metadata as { reason?: string } | null)?.reason).toBe("too_expensive");
  });

  it("C2 an unknown reason or a comment over 500 characters is refused, and nothing changes", async () => {
    expect((await request(app).post("/subscriptions/cancel").set(auth()).send({ reason: "angry" })).status).toBe(400);
    expect((await request(app).post("/subscriptions/cancel").set(auth()).send({ comment: "x".repeat(501) })).status).toBe(400);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).cancelAtPeriodEnd).toBe(false);
  });

  it("C3 an older app that posts no body can still cancel", async () => {
    const res = await request(app).post("/subscriptions/cancel").set(auth());
    expect(res.status).toBe(200);
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    expect(row).toMatchObject({ cancelAtPeriodEnd: true, cancelReason: null, cancelComment: null });
  });
});
