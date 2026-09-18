import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { env } from "../src/config/env";
import { createOrder } from "../src/modules/payments/payments.service";

/**
 * Gap §56's own honesty requirement, tested directly against
 * payments.service.ts's createOrder(): a booking attempt against a
 * relationship that isn't at least `accepted` must be refused BEFORE any
 * Razorpay order (and therefore before any Payment row) is created — not
 * just later, at createBooking() time, which would let a user sit through
 * Razorpay's real hosted Checkout only to be refused afterward. That
 * ordering is what this suite actually exercises: RAZORPAY_KEY_ID/SECRET
 * are configured (same env.RAZORPAY_* mutation pattern as
 * paymentsActivationRace.test.ts) so createOrder() gets past its own
 * isRazorpayConfigured() 503 guard, but the relationship-acceptance check
 * added 16 Sep 2026 sits BEFORE the real razorpay.orders.create() SDK call
 * — so a still-`requested` relationship never reaches Razorpay at all, and
 * this test can assert that with no live Razorpay credentials, no network
 * mocking, and (critically) no Payment row ever created for the refused
 * attempt.
 */
describe("Relationship acceptance gate: createOrder refuses a booking-purpose order before Razorpay/Payment exist", () => {
  let userId: string;
  let professionalId: string;
  let offeringId: string;
  let previousKeyId: string | undefined;
  let previousKeySecret: string | undefined;

  beforeAll(async () => {
    previousKeyId = env.RAZORPAY_KEY_ID;
    previousKeySecret = env.RAZORPAY_KEY_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_acceptance_gate_fixture";
    env.RAZORPAY_KEY_SECRET = "acceptance-gate-test-key-secret";

    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("relationship-acceptance-gate"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Relationship Acceptance Gate Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const professional = await prisma.professional.create({
      data: {
        email: `coach-acceptance-gate-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Acceptance Gate Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;

    const offering = await prisma.professionalServiceOffering.create({
      data: {
        professionalId,
        serviceType: "fitness",
        label: "Test Paid Session",
        durationMinutes: 60,
        priceCents: 1800,
        isActive: true,
      },
    });
    offeringId = offering.id;
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previousKeyId;
    env.RAZORPAY_KEY_SECRET = previousKeySecret;

    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  function tomorrowAt(hourUtc: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  }

  it("refuses to create the order for a brand-new (still-requested) relationship, with no Payment row created", async () => {
    await expect(
      createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: tomorrowAt(9) }),
    ).rejects.toMatchObject({ status: 409, code: "relationship_pending_acceptance" });

    const relationship = await prisma.relationship.findUnique({
      where: { userId_professionalId_serviceType: { userId, professionalId, serviceType: "fitness" } },
    });
    expect(relationship?.status).toBe("requested");

    const payments = await prisma.payment.findMany({ where: { userId } });
    expect(payments).toHaveLength(0);
  });

  it("refuses to create the order for a relationship the coach has already declined and left at ended-then-reclaimed requested", async () => {
    await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "fitness", status: "ended", endedAt: new Date(), endReason: "declined_by_professional" },
    });

    await expect(
      createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: tomorrowAt(9) }),
    ).rejects.toMatchObject({ status: 409, code: "relationship_pending_acceptance" });

    const relationship = await prisma.relationship.findUnique({
      where: { userId_professionalId_serviceType: { userId, professionalId, serviceType: "fitness" } },
    });
    // Reclaimed back to `requested` (a genuine new ask needs its own review
    // again), never silently re-accepted.
    expect(relationship?.status).toBe("requested");

    const payments = await prisma.payment.findMany({ where: { userId } });
    expect(payments).toHaveLength(0);
  });

  // Deliberately no "succeeds once accepted" case here — that would need a
  // real razorpay.orders.create() network call (no mock exists anywhere in
  // this codebase's test suite; every other Razorpay-configured test,
  // e.g. paymentsActivationRace.test.ts, avoids createOrder() entirely for
  // exactly this reason). The refusal path above is what gap §56 actually
  // needs proven: an accepted relationship reaching past this check and
  // into the real Razorpay call is already covered end-to-end by the local
  // HTTP verification run this pass did by hand (see gap §56's own
  // write-up), and by coaching.test.ts's accept-then-book flow for the
  // free-offering path, which shares the exact same relationship-status
  // check.
});
