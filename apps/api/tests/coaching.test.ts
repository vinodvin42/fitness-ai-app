import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Coach booking (coaching.service.ts's createBooking) — confirms a real
 * Relationship row is created as a side effect of a confirmed Booking, and
 * that double-booking the same professional's slot is rejected. The
 * Professional + ProfessionalServiceOffering fixtures are created directly
 * via Prisma rather than depending on scripts/seed.ts's demo coaches.
 *
 * **16 Sep 2026 (gap §56 — superseding this file's own pre-existing
 * comment about auto-accept):** a brand-new Relationship no longer
 * auto-advances past `requested` — a real coach has to accept it first
 * (POST /professionals/me/relationships/:id/accept). This suite now drives
 * that real flow: a booking attempt against a still-`requested`
 * relationship is refused (409 `relationship_pending_acceptance`) BEFORE
 * accepting, and only succeeds after the professional-authed accept call.
 *
 * The fixture offering is priced at 0 (5 Sep 2026, PAY-01) so POST
 * /coaching/bookings still confirms directly here — these two tests are
 * about Relationship creation and slot-conflict rejection, not payment.
 * The 402 boundary for a *paid* offering (payment_required without a
 * verified payment) is covered in parkedPayments.test.ts, alongside the
 * identical boundary for subscriptions/program purchases.
 *
 * Rate limits: POST /coaching/bookings and the accept/decline endpoints
 * all share `writeRateLimit` (30/15min) — well under that in this suite.
 */
describe("Coach booking creates a real Relationship, gated on a real coach accept", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  let professionalId: string;
  let professionalAccessToken: string;
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
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token;

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

  it("refuses a booking against a still-requested relationship (the coach hasn't accepted yet)", async () => {
    const res = await request(app)
      .post("/coaching/bookings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ professionalId, offeringId, scheduledAt: tomorrowAt(9) });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("relationship_pending_acceptance");

    const relationship = await prisma.relationship.findUnique({
      where: { userId_professionalId_serviceType: { userId, professionalId, serviceType: "fitness" } },
    });
    expect(relationship).not.toBeNull();
    expect(relationship?.status).toBe("requested");

    const booking = await prisma.booking.findFirst({ where: { userId, offeringId } });
    expect(booking).toBeNull();
  });

  it("lists the pending request for the professional and accepts it", async () => {
    const pending = await request(app)
      .get("/professionals/me/relationships/requests")
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(pending.status).toBe(200);
    expect(pending.body.requests).toHaveLength(1);
    const relationshipId = pending.body.requests[0].relationshipId;

    const accept = await request(app)
      .post(`/professionals/me/relationships/${relationshipId}/accept`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe("accepted");

    const relationship = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    expect(relationship?.status).toBe("accepted");
  });

  it("creates a booking and a real, active Relationship row once the coach has accepted", async () => {
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

/**
 * The real coach accept/decline gate itself (gap §56) — ownership
 * boundaries, the "already acted on" 409, and decline's real endReason.
 * Uses its own Professional + Relationship fixtures, separate from the
 * booking-flow suite above so accept/decline here never interfere with
 * that suite's own relationship lifecycle.
 */
describe("Coach relationship accept/decline (gap §56)", () => {
  const app = buildApp();
  let userId: string;
  let professionalId: string;
  let professionalAccessToken: string;
  let otherProfessionalId: string;
  let otherProfessionalAccessToken: string;

  beforeAll(async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("coaching-accept-decline"), password: "SomePassword1!", fullName: "Accept Decline Tester" });
    userId = signupRes.body.user.id;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `coach-accept-decline-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Accept Decline Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token;

    const otherProfessional = await prisma.professional.create({
      data: {
        email: `coach-other-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "A Different Coach",
        status: "active",
      },
    });
    otherProfessionalId = otherProfessional.id;
    otherProfessionalAccessToken = signProfessionalAccessToken({
      sub: otherProfessionalId,
      email: otherProfessional.email,
    }).token;
  });

  afterEach(async () => {
    // Each test below creates its own fresh Relationship row for (userId,
    // professionalId, serviceType) — clear it so the next test's create()
    // doesn't collide with the real @@unique([userId, professionalId,
    // serviceType]) constraint a prior test's row left behind.
    await prisma.relationship.deleteMany({ where: { professionalId } });
  });

  afterAll(async () => {
    await prisma.relationship.deleteMany({ where: { professionalId: { in: [professionalId, otherProfessionalId] } } });
    await prisma.professional.deleteMany({ where: { id: { in: [professionalId, otherProfessionalId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("declines a requested relationship with a real endReason and ends it", async () => {
    const relationship = await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "nutrition", status: "requested" },
    });

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/decline`)
      .set("Authorization", `Bearer ${professionalAccessToken}`)
      .send({ reason: "Not currently taking new nutrition clients" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ended");

    const dbRow = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRow?.status).toBe("ended");
    expect(dbRow?.endReason).toBe("Not currently taking new nutrition clients");
    expect(dbRow?.endedAt).not.toBeNull();
  });

  it("404s accepting/declining a relationship that belongs to a different professional", async () => {
    const relationship = await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "fitness", status: "requested" },
    });

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/accept`)
      .set("Authorization", `Bearer ${otherProfessionalAccessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("relationship_not_found");

    const dbRow = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRow?.status).toBe("requested"); // untouched by the wrong professional's attempt
  });

  it("409s accepting a relationship that's already been accepted", async () => {
    const relationship = await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "fitness", status: "accepted" },
    });

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/accept`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("relationship_not_requested");
  });

  it("concurrency: two simultaneous accept taps on the same requested relationship result in exactly one real transition", async () => {
    const relationship = await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "nutrition", status: "requested" },
    });

    const results = await Promise.allSettled([
      request(app)
        .post(`/professionals/me/relationships/${relationship.id}/accept`)
        .set("Authorization", `Bearer ${professionalAccessToken}`),
      request(app)
        .post(`/professionals/me/relationships/${relationship.id}/accept`)
        .set("Authorization", `Bearer ${professionalAccessToken}`),
    ]);

    const statuses = results.map((r) => (r.status === "fulfilled" ? r.value.status : null));
    // Exactly one of the two concurrent taps wins with 200; the other sees
    // the real post-claim state and gets a real 409, not a silent
    // duplicate success or an unhandled error.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    const dbRow = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRow?.status).toBe("accepted");
  });
});
