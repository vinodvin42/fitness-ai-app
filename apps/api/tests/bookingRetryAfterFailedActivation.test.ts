import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { env } from "../src/config/env";
import { verifyPayment } from "../src/modules/payments/payments.service";

/**
 * Figma coach/12 "We couldn't connect you to …" (24 Oct 2026, the owner left
 * the call to us): a coaching payment that was captured but whose session
 * couldn't be booked can be retried, at the same time or at another one, with
 * the same payment. One payment never makes two bookings.
 *
 * Same no-mock setup as wave7EndToEndFailureScenario.test.ts: a real
 * conflicting booking makes the paid booking fail, and verifyPayment() runs
 * for real on a directly created Payment row.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Booking retry after a failed activation", () => {
  const app = buildApp();
  let previous: { keyId?: string; keySecret?: string; webhook?: string } = {};
  let userId: string;
  let token: string;
  let professionalId: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let blockerUserId: string;
  let paymentId: string;
  const at = (daysAhead: number, hourUtc: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  };
  const taken = at(1, 10);
  const other = at(2, 11);
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const retry = (body?: object) => request(app).post(`/payments/${paymentId}/retry-activation`).set(auth()).send(body ?? {});

  beforeAll(async () => {
    previous = { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhook: env.RAZORPAY_WEBHOOK_SECRET };
    env.RAZORPAY_KEY_ID = "rzp_test_rebook_fixture";
    env.RAZORPAY_KEY_SECRET = "rebook-test-key-secret";
    env.RAZORPAY_WEBHOOK_SECRET = "rebook-test-webhook-secret";

    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("rebook"), password: "RebookPassword1!", fullName: "Rebook Member" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;

    const suffix = uniqueSuffix();
    professionalId = (
      await prisma.professional.create({
        data: {
          email: `rebook-coach-${suffix}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Rebook Coach",
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      })
    ).id;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 1800, durationMinutes: 60, label: "Rebook Session" });
    offeringId = pricing.offering.id;
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "awaiting_payment" } });

    blockerUserId = (
      await prisma.user.create({
        data: {
          email: uniqueEmail("rebook-blocker"),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Rebook Blocker",
          referralCode: await generateUniqueReferralCode(),
        },
      })
    ).id;
    await prisma.booking.create({
      data: { userId: blockerUserId, professionalId, offeringId, scheduledAt: new Date(taken), durationMinutes: 60, priceCents: 1800, commissionPct: 20, status: "confirmed" },
    });

    const providerOrderId = `order_rebook_${suffix}`;
    paymentId = (
      await prisma.payment.create({
        data: { userId, purpose: "booking", referenceId: offeringId, amountCents: 1800, currency: "INR", providerOrderId, status: "created", scheduledAt: new Date(taken) },
      })
    ).id;
    const razorpayPaymentId = `pay_rebook_${suffix}`;
    const razorpaySignature = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET!).update(`${providerOrderId}|${razorpayPaymentId}`).digest("hex");
    await expect(verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature })).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previous.keyId;
    env.RAZORPAY_KEY_SECRET = previous.keySecret;
    env.RAZORPAY_WEBHOOK_SECRET = previous.webhook;
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Payment", entityId: paymentId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, blockerUserId] } } });
    await prisma.$disconnect();
  });

  it("B1 the failure is recorded as retryable and the relationship says coaching didn't start", async () => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("paid");
    expect(payment.activationFailureReason).toBe("slot_unavailable");
    const rel = await prisma.relationship.findFirstOrThrow({ where: { userId, professionalId } });
    expect(rel.status).toBe("activation_failed");
  });

  it("B2 a time in the past is refused; the same taken time fails again and stays retryable", async () => {
    const past = await retry({ scheduledAt: at(-1, 10) });
    expect(past.status).toBe(409);
    expect(past.body.error.code).toBe("booking_time_passed");
    const same = await retry();
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("slot_unavailable");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).activationFailedAt).not.toBeNull();
  });

  it("B3 another time is booked with the same payment and coaching becomes active", async () => {
    const res = await retry({ scheduledAt: other });
    expect(res.status).toBe(200);
    expect(new Date(res.body.booking.scheduledAt).toISOString()).toBe(other);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.activatedAt).not.toBeNull();
    expect(payment.activationFailedAt).toBeNull();
    expect(payment.scheduledAt?.toISOString()).toBe(other);
    const mine = await prisma.booking.findMany({ where: { userId } });
    expect(mine).toHaveLength(1);
    expect(mine[0].scheduledAt.toISOString()).toBe(other);
    expect((await prisma.relationship.findFirstOrThrow({ where: { userId, professionalId } })).status).toBe("active");
    const audit = await prisma.auditLog.findFirst({ where: { entityId: paymentId, action: "booking.rebooked_with_same_payment" } });
    expect(audit).not.toBeNull();
  });

  it("B4 once booked, the payment can't book again", async () => {
    const again = await retry({ scheduledAt: at(3, 9) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("activation_not_failed");
    expect(await prisma.booking.count({ where: { userId } })).toBe(1);
  });
});
