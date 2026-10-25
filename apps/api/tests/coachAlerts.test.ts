import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * GET /professionals/me/alerts (25 Oct 2026, coach communication audit B2):
 * the counts behind the coach app's Alerts badge. Requests and offers count
 * while they wait for the coach (inside the reply window, not past
 * `expiresAt`); bookings count when they were made after `bookingsSince`.
 * Another coach's rows never count.
 *
 * Rate limits: no signups (users are created directly); 2 writes.
 */
describe("Coach alerts counts", () => {
  const app = buildApp();
  const userIds: string[] = [];
  let professionalId: string;
  let otherProfessionalId: string;
  let coachToken: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let otherPricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let freshRequestId: string;
  let openOfferId: string;
  let recentBookingId: string;
  let olderBookingId: string;
  const coach = () => ({ Authorization: `Bearer ${coachToken}` });
  const ago = (ms: number) => new Date(Date.now() - ms);
  const HOUR = 60 * 60 * 1000;
  const bookingBase = () => ({
    userId: userIds[2],
    professionalId,
    offeringId: pricing!.offering.id,
    scheduledAt: new Date(Date.now() + 72 * HOUR),
    durationMinutes: 60,
    priceCents: 1800,
    commissionPct: 20,
  });

  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({
        data: {
          email: uniqueEmail(`coach-alerts-${i}`),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Alerts Member ${i}`,
          referralCode: await generateUniqueReferralCode(),
        },
      });
      userIds.push(user.id);
    }
    const [u1, u2, u3] = userIds;

    const makeCoach = async (tag: string) =>
      prisma.professional.create({
        data: {
          email: `alerts-${tag}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Alerts Coach ${tag}`,
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      });
    const c1 = await makeCoach("one");
    const c2 = await makeCoach("two");
    professionalId = c1.id;
    otherProfessionalId = c2.id;
    coachToken = signProfessionalAccessToken({ sub: c1.id, email: c1.email }).token;

    // Requests: a fresh one and a legacy one (no requestedAt) count; one past
    // the 48-hour reply window, an accepted one and another coach's don't.
    freshRequestId = (
      await prisma.relationship.create({
        data: { userId: u1, professionalId, serviceType: "fitness", status: "requested", requestedAt: ago(1 * HOUR) },
      })
    ).id;
    await prisma.relationship.create({
      data: { userId: u1, professionalId, serviceType: "nutrition", status: "requested", requestedAt: ago(49 * HOUR) },
    });
    await prisma.relationship.create({
      data: { userId: u2, professionalId, serviceType: "fitness", status: "requested", createdAt: ago(2 * HOUR) },
    });
    await prisma.relationship.create({
      data: { userId: u2, professionalId, serviceType: "nutrition", status: "accepted", acceptedAt: ago(1 * HOUR) },
    });
    await prisma.relationship.create({ data: { userId: u3, professionalId, serviceType: "fitness", status: "active" } });
    await prisma.relationship.create({
      data: { userId: u1, professionalId: otherProfessionalId, serviceType: "fitness", status: "requested", requestedAt: ago(HOUR) },
    });

    // Offers: open with no expiry and open until tomorrow count; one past its
    // expiresAt (not yet lazily flipped), a declined one and another coach's don't.
    openOfferId = (
      await prisma.professionalOffer.create({ data: { professionalId, userId: u1, serviceType: "fitness", status: "offered" } })
    ).id;
    await prisma.professionalOffer.create({
      data: { professionalId, userId: u2, serviceType: "nutrition", status: "offered", expiresAt: new Date(Date.now() + 24 * HOUR) },
    });
    await prisma.professionalOffer.create({
      data: { professionalId, userId: u3, serviceType: "nutrition", status: "offered", expiresAt: ago(HOUR) },
    });
    await prisma.professionalOffer.create({
      data: { professionalId, userId: u3, serviceType: "fitness", status: "declined", respondedAt: ago(HOUR) },
    });
    await prisma.professionalOffer.create({
      data: { professionalId: otherProfessionalId, userId: u2, serviceType: "fitness", status: "offered" },
    });

    // Bookings: two confirmed ones booked 3 h and 10 min ago; a cancelled one
    // and another coach's, both booked 5 min ago, never count.
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 1800, label: "Alerts Session" });
    otherPricing = await createPricedOffering(otherProfessionalId, { serviceType: "fitness", feeCents: 1800 });
    olderBookingId = (await prisma.booking.create({ data: { ...bookingBase(), createdAt: ago(3 * HOUR) } })).id;
    recentBookingId = (await prisma.booking.create({ data: { ...bookingBase(), createdAt: ago(10 * 60 * 1000) } })).id;
    await prisma.booking.create({ data: { ...bookingBase(), status: "cancelled", createdAt: ago(5 * 60 * 1000) } });
    await prisma.booking.create({
      data: { ...bookingBase(), professionalId: otherProfessionalId, offeringId: otherPricing.offering.id, createdAt: ago(5 * 60 * 1000) },
    });
  });

  afterAll(async () => {
    const pros = [professionalId, otherProfessionalId].filter(Boolean);
    await prisma.booking.deleteMany({ where: { professionalId: { in: pros } } });
    await prisma.professionalOffer.deleteMany({ where: { professionalId: { in: pros } } });
    await prisma.relationship.deleteMany({ where: { professionalId: { in: pros } } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId: { in: pros } } });
    await pricing?.cleanup();
    await otherPricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: { in: pros } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("AL1 needs a professional token", async () => {
    const res = await request(app).get("/professionals/me/alerts");
    expect(res.status).toBe(401);
  });

  it("AL2 counts waiting requests and open offers; without bookingsSince no booking is new", async () => {
    const res = await request(app).get("/professionals/me/alerts").set(coach());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pendingRequests: 2, openOffers: 2, newBookings: [], newBookingCount: 0 });
    expect(Math.abs(new Date(res.body.asOf).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("AL3 lists confirmed bookings made after bookingsSince, newest first", async () => {
    const lastHour = await request(app).get("/professionals/me/alerts").query({ bookingsSince: ago(HOUR).toISOString() }).set(coach());
    expect(lastHour.status).toBe(200);
    expect(lastHour.body.newBookingCount).toBe(1);
    expect(lastHour.body.newBookings).toHaveLength(1);
    expect(lastHour.body.newBookings[0]).toMatchObject({
      id: recentBookingId,
      clientFullName: "Alerts Member 2",
      offeringLabel: "Alerts Session",
      durationMinutes: 60,
    });
    expect(typeof lastHour.body.newBookings[0].scheduledAt).toBe("string");
    expect(typeof lastHour.body.newBookings[0].bookedAt).toBe("string");

    const lastFourHours = await request(app)
      .get("/professionals/me/alerts")
      .query({ bookingsSince: ago(4 * HOUR).toISOString() })
      .set(coach());
    expect(lastFourHours.body.newBookingCount).toBe(2);
    expect(lastFourHours.body.newBookings.map((b: { id: string }) => b.id)).toEqual([recentBookingId, olderBookingId]);
  });

  it("AL4 after the app stores asOf, only bookings made later count", async () => {
    const first = await request(app).get("/professionals/me/alerts").set(coach());
    const seen = first.body.asOf as string;

    const none = await request(app).get("/professionals/me/alerts").query({ bookingsSince: seen }).set(coach());
    expect(none.body).toMatchObject({ newBookings: [], newBookingCount: 0 });

    const later = await prisma.booking.create({ data: { ...bookingBase(), createdAt: new Date(new Date(seen).getTime() + 1000) } });
    const one = await request(app).get("/professionals/me/alerts").query({ bookingsSince: seen }).set(coach());
    expect(one.body.newBookingCount).toBe(1);
    expect(one.body.newBookings[0].id).toBe(later.id);
    await prisma.booking.delete({ where: { id: later.id } });
  });

  it("AL5 shows at most 20 bookings but counts them all", async () => {
    const since = ago(60 * 1000).toISOString();
    await prisma.booking.createMany({ data: Array.from({ length: 22 }, () => ({ ...bookingBase(), createdAt: new Date() })) });
    const res = await request(app).get("/professionals/me/alerts").query({ bookingsSince: since }).set(coach());
    expect(res.body.newBookings).toHaveLength(20);
    expect(res.body.newBookingCount).toBe(22);
    await prisma.booking.deleteMany({ where: { professionalId, createdAt: { gt: new Date(since) }, id: { notIn: [recentBookingId, olderBookingId] } } });
  });

  it("AL6 rejects a bookingsSince that isn't an ISO date-time", async () => {
    const res = await request(app).get("/professionals/me/alerts").query({ bookingsSince: "yesterday" }).set(coach());
    expect(res.status).toBe(400);
  });

  it("AL7 declining a request and an offer takes each off the count", async () => {
    const declineRequest = await request(app).post(`/professionals/me/relationships/${freshRequestId}/decline`).set(coach()).send({});
    expect(declineRequest.status).toBe(200);
    const declineOffer = await request(app).post(`/professionals/me/offers/${openOfferId}/decline`).set(coach()).send({});
    expect(declineOffer.status).toBe(200);

    const res = await request(app).get("/professionals/me/alerts").set(coach());
    expect(res.body).toMatchObject({ pendingRequests: 1, openOffers: 1 });
  });
});
