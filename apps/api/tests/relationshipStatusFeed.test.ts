import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { env } from "../src/config/env";
import { ApiHttpError } from "../src/middleware/errorHandler";
import { verifyPayment } from "../src/modules/payments/payments.service";
import { claimRelationship } from "../src/modules/coaching/coaching.service";

/**
 * The user's coaching status feed, GET /coaching/relationships/status
 * (owner-approved A1 + B1, 18 Oct 2026):
 *  - a coach's decline is `declined` (not `ended`) and is listed for 30 days
 *    after `endedAt`, without the coach's free-text reason;
 *  - asking the same coach again reclaims a `declined` row to `requested`
 *    (so the payment gates, which refuse `requested`, still apply);
 *  - finished rows older than 30 days are left out;
 *  - `activating` past the 15-minute threshold is flagged `stuck`, and stuck /
 *    `activation_failed` rows carry the captured, never-activated booking
 *    payment's id for support.
 * Fixtures are created directly via Prisma, like coaching.test.ts.
 */
describe("Coaching status feed: declined, finished window, stuck and failed activation", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;
  let professionalId: string;
  let professionalAccessToken: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let offeringId: string;

  const feed = async () => {
    const res = await request(app).get("/coaching/relationships/status").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    return res.body.relationships as Array<Record<string, unknown>>;
  };
  const setUpdatedAt = (id: string, at: Date) => prisma.$executeRaw`UPDATE "relationships" SET "updatedAt" = ${at} WHERE "id" = ${id}`;

  beforeAll(async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("status-feed"), password: "SomePassword1!", fullName: "Status Feed Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `status-feed-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Status Feed Coach",
        status: "active",
      },
    });
    professionalId = professional.id;
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 50000 });
    offeringId = pricing.offering.id;
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("lists a coach-declined request as declined, with no reason, and reclaims it on a new ask", async () => {
    const rel = await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "requested" } });
    const decline = await request(app)
      .post(`/professionals/me/relationships/${rel.id}/decline`)
      .set("Authorization", `Bearer ${professionalAccessToken}`)
      .send({ reason: "Fully booked this month" });
    expect(decline.status).toBe(200);

    const rows = await feed();
    const row = rows.find((r) => r.relationshipId === rel.id);
    expect(row?.status).toBe("declined");
    expect(row?.endedAt).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain("Fully booked");

    const again = await claimRelationship(userId, professionalId, "fitness");
    expect(again.id).toBe(rel.id);
    const dbRow = await prisma.relationship.findUnique({ where: { id: rel.id } });
    expect(dbRow?.status).toBe("requested");
    expect(dbRow?.endedAt).toBeNull();
    expect(dbRow?.endReason).toBeNull();
  });

  it("leaves out finished relationships that ended more than 30 days ago, and every ended one", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const a = await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "completed", endedAt: old } });
    const b = await prisma.relationship.create({ data: { userId, professionalId, serviceType: "nutrition", status: "completed", endedAt: recent } });

    const ids = (await feed()).map((r) => r.relationshipId);
    expect(ids).not.toContain(a.id);
    expect(ids).toContain(b.id);

    await prisma.relationship.update({ where: { id: b.id }, data: { status: "ended" } });
    expect((await feed()).map((r) => r.relationshipId)).not.toContain(b.id);
  });

  it("flags activating past 15 minutes as stuck, with the captured booking payment's id; fresh activating is not stuck", async () => {
    const rel = await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "activating" } });
    expect((await feed()).find((r) => r.relationshipId === rel.id)).toMatchObject({ status: "activating", stuck: false, paymentId: null });

    const payment = await prisma.payment.create({
      data: {
        userId,
        purpose: "booking",
        referenceId: offeringId,
        amountCents: 50000,
        providerOrderId: `order_status_feed_${uniqueSuffix()}`,
        status: "paid",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });
    await setUpdatedAt(rel.id, new Date(Date.now() - 60 * 60 * 1000));

    const row = (await feed()).find((r) => r.relationshipId === rel.id);
    expect(row).toMatchObject({ status: "activating", stuck: true, paymentId: payment.id });
    expect(row?.activatingSince).toBeTruthy();
  });

  it("gives activation_failed rows the payment id, but never a payment that already activated or belongs to another coach", async () => {
    const rel = await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "activation_failed" } });
    await prisma.payment.create({
      data: {
        userId,
        purpose: "booking",
        referenceId: offeringId,
        amountCents: 50000,
        providerOrderId: `order_status_feed_${uniqueSuffix()}`,
        status: "paid",
        activatedAt: new Date(),
      },
    });
    expect((await feed()).find((r) => r.relationshipId === rel.id)).toMatchObject({ status: "activation_failed", paymentId: null });

    const unactivated = await prisma.payment.create({
      data: {
        userId,
        purpose: "booking",
        referenceId: offeringId,
        amountCents: 50000,
        providerOrderId: `order_status_feed_${uniqueSuffix()}`,
        status: "paid",
        createdAt: new Date(Date.now() - 60 * 1000),
      },
    });
    expect((await feed()).find((r) => r.relationshipId === rel.id)).toMatchObject({ paymentId: unactivated.id });
  });

  // B1 write side: payments.service.ts's activatePayment() booking catch. Same real trigger as
  // wave7EndToEndFailureScenario.test.ts (a confirmed booking already holds the slot), but with the relationship at
  // `awaiting_payment`, where createOrder() leaves it in the real flow.
  it("marks the relationship activation_failed when a captured booking payment's slot is already taken", async () => {
    const previous = { id: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET };
    env.RAZORPAY_KEY_ID = "rzp_test_status_feed_fixture";
    env.RAZORPAY_KEY_SECRET = "status-feed-test-key-secret";
    const slot = new Date();
    slot.setUTCDate(slot.getUTCDate() + 2);
    slot.setUTCHours(11, 0, 0, 0);
    const blocker = await prisma.user.create({
      data: {
        email: uniqueEmail("status-feed-blocker"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Status Feed Slot Blocker",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    try {
      await prisma.booking.create({
        data: { userId: blocker.id, professionalId, offeringId, scheduledAt: slot, durationMinutes: 60, priceCents: 50000, commissionPct: 20, status: "confirmed" },
      });
      const rel = await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "awaiting_payment" } });
      const providerOrderId = `order_status_feed_${uniqueSuffix()}`;
      const payment = await prisma.payment.create({
        data: { userId, purpose: "booking", referenceId: offeringId, amountCents: 50000, providerOrderId, status: "created", scheduledAt: slot },
      });
      const razorpayPaymentId = `pay_status_feed_${uniqueSuffix()}`;
      const razorpaySignature = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET!).update(`${providerOrderId}|${razorpayPaymentId}`).digest("hex");

      let caught: unknown;
      try {
        await verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature });
      } catch (err) {
        caught = err;
      }
      expect((caught as ApiHttpError).code).toBe("slot_unavailable");

      expect((await prisma.relationship.findUnique({ where: { id: rel.id } }))?.status).toBe("activation_failed");
      expect((await feed()).find((r) => r.relationshipId === rel.id)).toMatchObject({ status: "activation_failed", paymentId: payment.id });
    } finally {
      await prisma.booking.deleteMany({ where: { professionalId } });
      await prisma.user.deleteMany({ where: { id: blocker.id } });
      env.RAZORPAY_KEY_ID = previous.id;
      env.RAZORPAY_KEY_SECRET = previous.secret;
    }
  });
});
