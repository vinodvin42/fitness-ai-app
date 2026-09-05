import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Coach booking (coaching.service.ts's createBooking) — confirms a real
 * Relationship row is created as a side effect of a confirmed Booking, and
 * that double-booking the same professional's slot is rejected. The
 * Professional + ProfessionalServiceOffering fixtures are created directly
 * via Prisma rather than depending on scripts/seed.ts's demo coaches.
 *
 * The fixture offering is priced at 0 (5 Sep 2026, PAY-01) so POST
 * /coaching/bookings still confirms directly here — these two tests are
 * about Relationship creation and slot-conflict rejection, not payment.
 * The 402 boundary for a *paid* offering (payment_required without a
 * verified payment) is covered in parkedPayments.test.ts, alongside the
 * identical boundary for subscriptions/program purchases.
 *
 * Rate limits: POST /coaching/bookings shares `writeRateLimit`
 * (30/15min) — only 2 calls happen here.
 */
describe("Coach booking creates a real Relationship", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  let professionalId: string;
  let offeringId: string;

  beforeAll(async () => {
    userEmail = uniqueEmail("coaching");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Coaching Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Test Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;

    const offering = await prisma.professionalServiceOffering.create({
      data: {
        professionalId,
        serviceType: "fitness",
        label: "Test Fitness Session",
        durationMinutes: 60,
        priceCents: 0, // see this file's own top comment — PAY-01 gates anything priced above zero
        isActive: true,
      },
    });
    offeringId = offering.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
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

  it("creates a booking and a real, active Relationship row for the (user, professional, service)", async () => {
    const scheduledAt = tomorrowAt(10);
    const res = await request(app)
      .post("/coaching/bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ professionalId, offeringId, scheduledAt });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.professionalId).toBe(professionalId);
    expect(res.body.relationshipIds).toHaveLength(1);

    const dbBooking = await prisma.booking.findUnique({ where: { id: res.body.id } });
    expect(dbBooking).not.toBeNull();
    expect(dbBooking?.userId).toBe(userId);
    expect(dbBooking?.offeringId).toBe(offeringId);

    const relationship = await prisma.relationship.findUnique({ where: { id: res.body.relationshipIds[0] } });
    expect(relationship).not.toBeNull();
    expect(relationship?.userId).toBe(userId);
    expect(relationship?.professionalId).toBe(professionalId);
    expect(relationship?.serviceType).toBe("fitness");
    expect(relationship?.status).toBe("active");
  });

  it("rejects booking the same professional's already-confirmed slot", async () => {
    const scheduledAt = tomorrowAt(14);
    const first = await request(app)
      .post("/coaching/bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ professionalId, offeringId, scheduledAt });
    expect(first.status).toBe(201);

    const conflict = await request(app)
      .post("/coaching/bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ professionalId, offeringId, scheduledAt });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("slot_unavailable");
  });
});
