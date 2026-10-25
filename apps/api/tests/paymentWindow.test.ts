import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { env } from "../src/config/env";
import { createOrder } from "../src/modules/payments/payments.service";
import { PAYMENT_WINDOW_MS } from "../src/lib/relationshipActivation";

/** 25 Oct 2026 (Figma coach/09): the member has 48 hours to pay once the coach accepts. */
describe("Payment window after a coach accepts", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;
  let professionalId: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let previousKeyId: string | undefined;
  let previousKeySecret: string | undefined;

  beforeAll(async () => {
    previousKeyId = env.RAZORPAY_KEY_ID;
    previousKeySecret = env.RAZORPAY_KEY_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_payment_window_fixture";
    env.RAZORPAY_KEY_SECRET = "payment-window-test-key-secret";
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail("paywin"), password: "SomePassword1!", fullName: "Pay Window" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
    const professional = await prisma.professional.create({
      data: { email: `coach-paywin-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused-not-logged-in-with"), fullName: "Window Coach", status: "active" },
    });
    professionalId = professional.id;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 150000, durationMinutes: 45, label: "Window Session" });
    offeringId = pricing.offering.id;
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previousKeyId;
    env.RAZORPAY_KEY_SECRET = previousKeySecret;
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const tomorrow = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(9, 0, 0, 0);
    return d.toISOString();
  };

  it("an accepted request shows when the time to pay ends", async () => {
    const acceptedAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "accepted", requestedAt: new Date(Date.now() - 2 * 3_600_000), acceptedAt } });
    const status = await request(app).get("/coaching/relationships/status").set("Authorization", auth);
    const row = status.body.relationships.find((r: { professionalId: string }) => r.professionalId === professionalId);
    expect(row.status).toBe("accepted");
    expect(new Date(row.payBy).getTime()).toBe(acceptedAt.getTime() + PAYMENT_WINDOW_MS);
  });

  it("after 48 hours unpaid it has expired, keeps acceptedAt, and nothing was charged", async () => {
    const acceptedAt = new Date(Date.now() - PAYMENT_WINDOW_MS - 60_000);
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "accepted", requestedAt: new Date(acceptedAt.getTime() - 3_600_000), acceptedAt } });
    const status = await request(app).get("/coaching/relationships/status").set("Authorization", auth);
    const row = status.body.relationships.find((r: { professionalId: string }) => r.professionalId === professionalId);
    expect(row.status).toBe("expired");
    expect(row.acceptedAt).toBeTruthy();
    expect(row.payBy).toBeNull();
    const stored = await prisma.relationship.findFirst({ where: { userId, professionalId } });
    expect(stored?.endReason).toBe("not_paid");
  });

  it("paying after the window closed is refused with its own answer and no payment row", async () => {
    const acceptedAt = new Date(Date.now() - PAYMENT_WINDOW_MS - 60_000);
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "accepted", requestedAt: new Date(acceptedAt.getTime() - 3_600_000), acceptedAt } });
    await expect(createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: tomorrow() })).rejects.toMatchObject({
      status: 409,
      code: "payment_window_ended",
    });
    expect(await prisma.payment.count({ where: { userId } })).toBe(0);
  });

  it("a checkout already started (awaiting_payment) is never cut off", async () => {
    const acceptedAt = new Date(Date.now() - PAYMENT_WINDOW_MS - 60_000);
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "awaiting_payment", requestedAt: new Date(acceptedAt.getTime() - 3_600_000), acceptedAt } });
    await request(app).get("/coaching/relationships/status").set("Authorization", auth);
    const stored = await prisma.relationship.findFirst({ where: { userId, professionalId } });
    expect(stored?.status).toBe("awaiting_payment");
  });
});
