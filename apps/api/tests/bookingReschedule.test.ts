import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";

/** Member reschedule, Figma coach/15 (25 Oct 2026): up to 24 hours before, onto a free slot of the coach's grid. */
describe("Member moves a booked session", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;
  let otherAuth: string;
  let otherUserId: string;
  let professionalId: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  const DAY = 24 * 60 * 60 * 1000;
  const slot = (daysAhead: number, hourUtc: number) => {
    const d = new Date(Date.now() + daysAhead * DAY);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d;
  };
  const book = (scheduledAt: Date, forUser = userId) =>
    prisma.booking.create({
      data: { userId: forUser, professionalId, offeringId, scheduledAt, durationMinutes: 60, priceCents: 150000, gstCents: 27000, commissionPct: 20, status: "confirmed" },
    });

  beforeAll(async () => {
    const a = await request(app).post("/auth/signup").send({ email: uniqueEmail("resched"), password: "SomePassword1!", fullName: "Move Me" });
    userId = a.body.user.id;
    auth = `Bearer ${a.body.tokens.accessToken}`;
    const b = await request(app).post("/auth/signup").send({ email: uniqueEmail("resched-other"), password: "SomePassword1!", fullName: "Someone Else" });
    otherUserId = b.body.user.id;
    otherAuth = `Bearer ${b.body.tokens.accessToken}`;
    const professional = await prisma.professional.create({
      data: { email: `coach-resched-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused-not-logged-in-with"), fullName: "Grid Coach", status: "active" },
    });
    professionalId = professional.id;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 150000, durationMinutes: 60, label: "Grid Session" });
    offeringId = pricing.offering.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [userId, otherUserId] } } });
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("moves a session that's more than 24 hours away to a free slot", async () => {
    const booking = await book(slot(3, 10));
    const to = slot(4, 11);
    const res = await request(app).post(`/coaching/bookings/${booking.id}/reschedule`).set("Authorization", auth).send({ scheduledAt: to.toISOString() });
    expect(res.status).toBe(200);
    expect(new Date(res.body.scheduledAt).getTime()).toBe(to.getTime());
    const stored = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stored?.scheduledAt.getTime()).toBe(to.getTime());
  });

  it("refuses inside the last 24 hours", async () => {
    const soon = new Date(Date.now() + 5 * 60 * 60 * 1000);
    soon.setUTCMinutes(0, 0, 0);
    const booking = await book(soon);
    const res = await request(app).post(`/coaching/bookings/${booking.id}/reschedule`).set("Authorization", auth).send({ scheduledAt: slot(5, 12).toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("reschedule_too_late");
  });

  it("refuses a taken slot and a time off the grid", async () => {
    const mine = await book(slot(6, 10));
    await book(slot(6, 14), otherUserId);
    const taken = await request(app).post(`/coaching/bookings/${mine.id}/reschedule`).set("Authorization", auth).send({ scheduledAt: slot(6, 14).toISOString() });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("slot_unavailable");
    const offGrid = new Date(slot(7, 10).getTime() + 30 * 60 * 1000);
    const bad = await request(app).post(`/coaching/bookings/${mine.id}/reschedule`).set("Authorization", auth).send({ scheduledAt: offGrid.toISOString() });
    expect(bad.status).toBe(400);
    const night = await request(app).post(`/coaching/bookings/${mine.id}/reschedule`).set("Authorization", auth).send({ scheduledAt: slot(7, 22).toISOString() });
    expect(night.status).toBe(400);
  });

  it("never touches another member's booking", async () => {
    const mine = await book(slot(8, 10));
    const res = await request(app).post(`/coaching/bookings/${mine.id}/reschedule`).set("Authorization", otherAuth).send({ scheduledAt: slot(8, 12).toISOString() });
    expect(res.status).toBe(404);
  });
});
