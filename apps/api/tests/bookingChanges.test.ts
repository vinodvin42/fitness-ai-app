import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Booking changes (27 Oct 2026, owner's policy): a member cancels any time
 * before the start and gets a session credit worth what they paid; a coach
 * proposes a new time (12 hours' notice), which the member accepts or
 * declines for a credit; a credit books a session it fully covers, with no
 * payment.
 *
 * Rate limits: 2 signups; writes are under the per-test budget.
 */
describe("Booking changes: cancel for a credit, coach-proposed times, booking with a credit", () => {
  const app = buildApp();
  let userId: string;
  let otherUserId: string;
  let auth: string;
  let otherAuth: string;
  let professionalId: string;
  let coachAuth: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  const DAY = 24 * 60 * 60 * 1000;
  const slot = (daysAhead: number, hourUtc: number) => {
    const d = new Date(Date.now() + daysAhead * DAY);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d;
  };
  const book = (scheduledAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.booking.create({
      data: {
        userId,
        professionalId,
        offeringId,
        scheduledAt,
        durationMinutes: 60,
        priceCents: 150000,
        gstCents: 27000,
        commissionPct: 20,
        status: "confirmed",
        ...extra,
      },
    });

  beforeAll(async () => {
    const a = await request(app).post("/auth/signup").send({ email: uniqueEmail("bchange"), password: "SomePassword1!", fullName: "Credit Member" });
    userId = a.body.user.id;
    auth = `Bearer ${a.body.tokens.accessToken}`;
    const b = await request(app).post("/auth/signup").send({ email: uniqueEmail("bchange-other"), password: "SomePassword1!", fullName: "Other Member" });
    otherUserId = b.body.user.id;
    otherAuth = `Bearer ${b.body.tokens.accessToken}`;
    const professional = await prisma.professional.create({
      data: {
        email: `coach-bchange-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Change Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 15,
      },
    });
    professionalId = professional.id;
    coachAuth = `Bearer ${signProfessionalAccessToken({ sub: professional.id, email: professional.email }).token}`;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 150000, durationMinutes: 60, label: "Change Session" });
    offeringId = pricing.offering.id;
    // The coach has accepted this member, so a credit can book with them.
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "active", requestedAt: new Date() } });
  });

  afterAll(async () => {
    await prisma.professionalNotification.deleteMany({ where: { professionalId } });
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [userId, otherUserId] } }, { actorProfessionalId: professionalId }] } });
    await prisma.booking.updateMany({ where: { professionalId }, data: { paidWithCreditId: null } });
    await prisma.sessionCredit.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("cancels any time before the start and gives a credit worth what was paid", async () => {
    // Only 2 hours away: still cancellable, and the coach is told.
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
    soon.setUTCMinutes(0, 0, 0);
    const booking = await book(soon);
    const res = await request(app).post(`/coaching/bookings/${booking.id}/cancel`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(res.body.credit.amountCents).toBe(177000);
    const days = (new Date(res.body.credit.expiresAt).getTime() - Date.now()) / DAY;
    expect(Math.round(days)).toBe(90);

    const stored = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stored).toMatchObject({ status: "cancelled", cancelledBy: "member", cancelReason: "member_cancelled" });
    const notice = await prisma.professionalNotification.findFirst({ where: { professionalId, title: "Credit Member cancelled a session" } });
    expect(notice?.link).toBe("/calendar");

    const again = await request(app).post(`/coaching/bookings/${booking.id}/cancel`).set("Authorization", auth);
    expect(again.status).toBe(409);
    expect(await prisma.sessionCredit.count({ where: { sourceBookingId: booking.id } })).toBe(1);
  });

  it("credits what the payment actually charged when a coupon cut the price", async () => {
    const payment = await prisma.payment.create({
      data: { userId, purpose: "booking", referenceId: offeringId, amountCents: 120000, currency: "INR", status: "paid", provider: "razorpay", providerOrderId: `order_test_${uniqueSuffix()}` },
    });
    const booking = await book(slot(3, 10), { paymentId: payment.id });
    const res = await request(app).post(`/coaching/bookings/${booking.id}/cancel`).set("Authorization", auth);
    expect(res.body.credit.amountCents).toBe(120000);
    await prisma.booking.update({ where: { id: booking.id }, data: { paymentId: null } });
    await prisma.sessionCredit.deleteMany({ where: { sourceBookingId: booking.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  it("refuses a session that has started, and another member's session", async () => {
    const started = await book(new Date(Date.now() - 10 * 60 * 1000));
    const late = await request(app).post(`/coaching/bookings/${started.id}/cancel`).set("Authorization", auth);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("booking_started");
    const mine = await book(slot(4, 10));
    const theirs = await request(app).post(`/coaching/bookings/${mine.id}/cancel`).set("Authorization", otherAuth);
    expect(theirs.status).toBe(404);
  });

  it("lets the coach propose a new time, and the member accept it", async () => {
    const booking = await book(slot(5, 10));
    const to = slot(5, 13);
    // The coach sees their own grid, with this session's hour taken.
    const day = slot(5, 10).toISOString().slice(0, 10);
    const grid = await request(app).get(`/professionals/me/availability?date=${day}`).set("Authorization", coachAuth);
    expect(grid.status).toBe(200);
    expect(grid.body.slots.find((s: { time: string }) => s.time === slot(5, 10).toISOString())?.available).toBe(false);
    expect(grid.body.slots.find((s: { time: string }) => s.time === to.toISOString())?.available).toBe(true);
    const p = await request(app).post(`/professionals/me/bookings/${booking.id}/propose-time`).set("Authorization", coachAuth).send({ scheduledAt: to.toISOString() });
    expect(p.status).toBe(200);
    const memberView = await request(app).get("/coaching/bookings").set("Authorization", auth);
    const row = memberView.body.items.find((i: { id: string }) => i.id === booking.id);
    expect(new Date(row.proposedScheduledAt).getTime()).toBe(to.getTime());
    const told = await prisma.notification.findFirst({ where: { userId, title: "Change Coach asked to move your session" } });
    expect(told?.deepLink).toBe(`coach-session?bookingId=${booking.id}`);

    const a = await request(app).post(`/coaching/bookings/${booking.id}/proposal/accept`).set("Authorization", auth);
    expect(a.status).toBe(200);
    const stored = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stored?.scheduledAt.getTime()).toBe(to.getTime());
    expect(stored?.proposedScheduledAt).toBeNull();
    expect(stored?.status).toBe("confirmed");
  });

  it("cancels with a credit when the member declines the new time", async () => {
    const booking = await book(slot(6, 10));
    await request(app).post(`/professionals/me/bookings/${booking.id}/propose-time`).set("Authorization", coachAuth).send({ scheduledAt: slot(6, 15).toISOString() });
    const d = await request(app).post(`/coaching/bookings/${booking.id}/proposal/decline`).set("Authorization", auth);
    expect(d.status).toBe(200);
    expect(d.body.credit.reason).toBe("reschedule_declined");
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("cancelled");
  });

  it("refuses a proposal inside 12 hours, onto a taken slot, or off the grid", async () => {
    const soon = new Date(Date.now() + 6 * 60 * 60 * 1000);
    soon.setUTCMinutes(0, 0, 0);
    const close = await book(soon);
    const late = await request(app).post(`/professionals/me/bookings/${close.id}/propose-time`).set("Authorization", coachAuth).send({ scheduledAt: slot(9, 10).toISOString() });
    expect(late.body.error.code).toBe("proposal_too_late");

    const booking = await book(slot(7, 10));
    await book(slot(7, 12));
    const taken = await request(app).post(`/professionals/me/bookings/${booking.id}/propose-time`).set("Authorization", coachAuth).send({ scheduledAt: slot(7, 12).toISOString() });
    expect(taken.body.error.code).toBe("slot_unavailable");
    const offGrid = await request(app).post(`/professionals/me/bookings/${booking.id}/propose-time`).set("Authorization", coachAuth).send({ scheduledAt: slot(7, 22).toISOString() });
    expect(offGrid.status).toBe(400);
  });

  it("books with a credit that covers the price, without any payment", async () => {
    const credits = await request(app).get("/coaching/credits").set("Authorization", auth);
    const credit = credits.body.items.find((c: { amountCents: number }) => c.amountCents >= 177000);
    expect(credit).toBeDefined();
    const to = slot(10, 11);
    const res = await request(app)
      .post("/coaching/bookings/with-credit")
      .set("Authorization", auth)
      .send({ professionalId, offeringId, scheduledAt: to.toISOString(), creditId: credit.id });
    expect(res.status).toBe(201);
    const booking = await prisma.booking.findFirst({ where: { professionalId, scheduledAt: to } });
    expect(booking).toMatchObject({ status: "confirmed", paidWithCreditId: credit.id, priceCents: 150000 });
    const spent = await prisma.sessionCredit.findUnique({ where: { id: credit.id } });
    expect(spent?.usedAt).not.toBeNull();

    const twice = await request(app)
      .post("/coaching/bookings/with-credit")
      .set("Authorization", auth)
      .send({ professionalId, offeringId, scheduledAt: slot(11, 11).toISOString(), creditId: credit.id });
    expect(twice.body.error.code).toBe("credit_used");
  });

  it("refuses a credit too small for the session, and gives it back when the slot is taken", async () => {
    const source = await book(slot(12, 9), { status: "cancelled" });
    const small = await prisma.sessionCredit.create({
      data: { userId, amountCents: 50000, reason: "member_cancelled", sourceBookingId: source.id, expiresAt: new Date(Date.now() + 30 * DAY) },
    });
    const tooSmall = await request(app)
      .post("/coaching/bookings/with-credit")
      .set("Authorization", auth)
      .send({ professionalId, offeringId, scheduledAt: slot(12, 11).toISOString(), creditId: small.id });
    expect(tooSmall.body.error.code).toBe("credit_too_small");

    const source2 = await book(slot(12, 10), { status: "cancelled" });
    const big = await prisma.sessionCredit.create({
      data: { userId, amountCents: 200000, reason: "member_cancelled", sourceBookingId: source2.id, expiresAt: new Date(Date.now() + 30 * DAY) },
    });
    await book(slot(13, 11));
    const taken = await request(app)
      .post("/coaching/bookings/with-credit")
      .set("Authorization", auth)
      .send({ professionalId, offeringId, scheduledAt: slot(13, 11).toISOString(), creditId: big.id });
    expect(taken.status).toBe(409);
    expect((await prisma.sessionCredit.findUnique({ where: { id: big.id } }))?.usedAt).toBeNull();
  });
});
