import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * The parked-payment security boundary. Razorpay is deliberately
 * unconfigured in every test/dev/CI environment (RAZORPAY_KEY_ID/SECRET
 * are unset — see src/lib/razorpayClient.ts's isRazorpayConfigured()), so
 * this suite does not attempt to mock a real Razorpay call. What it does
 * verify for real is the actual boundary that prevents a paid plan,
 * program, or (5 Sep 2026, PAY-01) coach booking from being granted for
 * free while payments are parked: subscribe()/purchaseProgram()/
 * createBooking() all require `{ verifiedPayment: true }` for anything
 * priced above zero, and neither /subscriptions, /programs/:id/purchase,
 * nor /coaching/bookings ever passes that flag — only
 * payments.service.ts's activatePayment() does, after a real signature
 * verification, which can never happen here.
 *
 * Fixtures: a paid SubscriptionPlan, a free SubscriptionPlan, a paid
 * Program, and a paid Professional + ProfessionalServiceOffering are all
 * created directly via Prisma with unique ids, rather than relying on
 * scripts/seed.ts having already run against this database.
 */
describe("Parked payments: subscriptions, program purchases, bookings, Razorpay", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  let paidPlanId: string;
  let freePlanId: string;
  let paidProgramId: string;
  let paidProfessionalId: string;
  let paidOfferingId: string;

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

    const professional = await prisma.professional.create({
      data: {
        email: `parked-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Parked Payments Fixture Coach",
        status: "active",
      },
    });
    paidProfessionalId = professional.id;
    const offering = await prisma.professionalServiceOffering.create({
      data: {
        professionalId: paidProfessionalId,
        serviceType: "fitness",
        label: "Test Paid Session",
        durationMinutes: 60,
        priceCents: 1800,
        isActive: true,
      },
    });
    paidOfferingId = offering.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { professionalId: paidProfessionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId: paidProfessionalId } });
    await prisma.professional.deleteMany({ where: { id: paidProfessionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: [paidPlanId, freePlanId] } } });
    await prisma.program.deleteMany({ where: { id: paidProgramId } });
    await prisma.$disconnect();
  });

  function tomorrowAt(hourUtc: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  }

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

  it("rejects booking a paid coach session without a verified payment (402)", async () => {
    const res = await request(app)
      .post("/coaching/bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ professionalId: paidProfessionalId, offeringId: paidOfferingId, scheduledAt: tomorrowAt(11) });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("payment_required");

    const booking = await prisma.booking.findFirst({ where: { userId, offeringId: paidOfferingId } });
    expect(booking).toBeNull();
  });

  it("503s cleanly creating a Razorpay order for a booking while payments are unconfigured", async () => {
    const res = await request(app)
      .post("/payments/razorpay/orders")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ purpose: "booking", referenceId: paidOfferingId, scheduledAt: tomorrowAt(11) });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("payment_gateway_not_configured");
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
