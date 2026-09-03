import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";

/**
 * The parked-payment security boundary. Razorpay is deliberately
 * unconfigured in every test/dev/CI environment (RAZORPAY_KEY_ID/SECRET
 * are unset — see src/lib/razorpayClient.ts's isRazorpayConfigured()), so
 * this suite does not attempt to mock a real Razorpay call. What it does
 * verify for real is the actual boundary that prevents a paid plan or
 * program from being granted for free while payments are parked:
 * subscribe()/purchaseProgram() both require `{ verifiedPayment: true }`
 * for anything priced above zero, and neither /subscriptions nor
 * /programs/:id/purchase ever passes that flag — only
 * payments.service.ts's activatePayment() does, after a real signature
 * verification, which can never happen here.
 *
 * Fixtures: a paid SubscriptionPlan, a free SubscriptionPlan, and a paid
 * Program are all created directly via Prisma with unique ids, rather than
 * relying on scripts/seed.ts having already run against this database.
 */
describe("Parked payments: subscriptions, program purchases, Razorpay", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  let paidPlanId: string;
  let freePlanId: string;
  let paidProgramId: string;

  beforeAll(async () => {
    userEmail = uniqueEmail("parked-payments");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Parked Payments Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    const suffix = uniqueSuffix();
    paidPlanId = `test-plan-paid-${suffix}`;
    freePlanId = `test-plan-free-${suffix}`;
    paidProgramId = `test-program-paid-${suffix}`;

    await prisma.subscriptionPlan.create({
      data: { id: paidPlanId, tier: "pro", name: "Test Pro Plan", priceCents: 1499, billingCycle: "monthly", isActive: true },
    });
    await prisma.subscriptionPlan.create({
      data: { id: freePlanId, tier: "basic", name: "Test Basic Plan", priceCents: 0, billingCycle: "monthly", isActive: true },
    });
    await prisma.program.create({
      data: {
        id: paidProgramId,
        name: "Test Paid Program",
        type: "fitness",
        description: "Fixture program for the parked-payment boundary test.",
        durationWeeks: 4,
        isAiOnly: true,
        priceCents: 1999,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: [paidPlanId, freePlanId] } } });
    await prisma.program.deleteMany({ where: { id: paidProgramId } });
    await prisma.$disconnect();
  });

  it("rejects subscribing to a paid plan without a verified payment (402)", async () => {
    const res = await request(app)
      .post("/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ planId: paidPlanId });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("payment_required");

    const subscription = await prisma.subscription.findFirst({ where: { userId, planId: paidPlanId } });
    expect(subscription).toBeNull();
  });

  it("allows subscribing to a free plan directly (no payment step needed)", async () => {
    const res = await request(app)
      .post("/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ planId: freePlanId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
    expect(res.body.planId).toBe(freePlanId);
  });

  it("rejects purchasing a paid program without a verified payment (402)", async () => {
    const res = await request(app)
      .post(`/programs/${paidProgramId}/purchase`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("payment_required");

    const purchase = await prisma.programPurchase.findUnique({
      where: { userId_programId: { userId, programId: paidProgramId } },
    });
    expect(purchase).toBeNull();
  });

  it("reports Razorpay as not configured via GET /payments/config", async () => {
    const res = await request(app).get("/payments/config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: false });
  });

  it("503s cleanly creating a Razorpay order while payments are unconfigured", async () => {
    const res = await request(app)
      .post("/payments/razorpay/orders")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ purpose: "subscription", referenceId: paidPlanId });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("payment_gateway_not_configured");
  });
});
