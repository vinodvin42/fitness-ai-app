import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Session summaries, coach side (25 Oct 2026): the coach publishes a
 * summary, then reads it back after a reload, from GET
 * /professionals/me/bookings/:id/summary and from `hasSummary` on the
 * Calendar, Client Profile and dashboard schedule rows. Another coach can't
 * read it.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Coach session summary read-back", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let professionalId: string;
  let otherProfessionalId: string;
  let coachToken: string;
  let otherCoachToken: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let pastId: string;
  let otherPastId: string;
  const coach = () => ({ Authorization: `Bearer ${coachToken}` });
  const hours = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000);

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("coach-summary"), password: "SummaryPassword1!", fullName: "Summary Member" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;

    const makeCoach = async (tag: string) =>
      prisma.professional.create({
        data: {
          email: `summary-${tag}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Summary Coach ${tag}`,
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
    otherCoachToken = signProfessionalAccessToken({ sub: c2.id, email: c2.email }).token;
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "active" } });
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 1800, durationMinutes: 60, label: "Summary Session" });
    const base = { userId, professionalId, offeringId: pricing.offering.id, durationMinutes: 60, priceCents: 1800, commissionPct: 20, status: "confirmed" as const };
    // Within today's UTC day where possible, so the dashboard's todaysSchedule can carry it too.
    pastId = (await prisma.booking.create({ data: { ...base, scheduledAt: new Date(Date.now() - 60 * 1000) } })).id;
    otherPastId = (await prisma.booking.create({ data: { ...base, scheduledAt: hours(-48) } })).id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: { in: [professionalId, otherProfessionalId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("CS1 before publishing, the coach reads an empty summary and schedule rows say hasSummary false", async () => {
    const empty = await request(app).get(`/professionals/me/bookings/${pastId}/summary`).set(coach());
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ id: pastId, hasSummary: false, summaryText: null, summaryPublishedAt: null });

    const schedule = await request(app).get("/professionals/me/schedule").set(coach());
    expect(schedule.status).toBe(200);
    const rows = [...schedule.body.upcoming, ...schedule.body.past];
    expect(rows.find((r: { id: string }) => r.id === pastId)).toMatchObject({ hasSummary: false });
  });

  it("CS2 after publishing, a fresh read returns the text, and every schedule row reports it", async () => {
    const published = await request(app)
      .post(`/professionals/me/bookings/${pastId}/summary`)
      .set(coach())
      .send({ summaryText: "  Squats felt strong. Add a set next week.  " });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ hasSummary: true, summaryText: "Squats felt strong. Add a set next week." });

    const read = await request(app).get(`/professionals/me/bookings/${pastId}/summary`).set(coach());
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      id: pastId,
      hasSummary: true,
      summaryText: "Squats felt strong. Add a set next week.",
      summaryPublishedAt: published.body.summaryPublishedAt,
    });

    const schedule = await request(app).get("/professionals/me/schedule").set(coach());
    const byId = new Map([...schedule.body.upcoming, ...schedule.body.past].map((r: { id: string }) => [r.id, r]));
    expect(byId.get(pastId)).toMatchObject({ hasSummary: true });
    expect(byId.get(otherPastId)).toMatchObject({ hasSummary: false });

    const profile = await request(app).get(`/professionals/me/clients/${userId}`).set(coach());
    expect(profile.status).toBe(200);
    const profileRows = new Map(profile.body.sessions.past.map((r: { id: string }) => [r.id, r]));
    expect(profileRows.get(pastId)).toMatchObject({ hasSummary: true });
    expect(profileRows.get(otherPastId)).toMatchObject({ hasSummary: false });

    // todaysSchedule is confirmed bookings in today's UTC day; the fixture lands there unless the run straddles midnight UTC.
    const dashboard = await request(app).get("/professionals/me/dashboard").set(coach());
    expect(dashboard.status).toBe(200);
    const today = dashboard.body.todaysSchedule as Array<{ id: string; hasSummary: boolean }>;
    const pastStart = (await prisma.booking.findUniqueOrThrow({ where: { id: pastId } })).scheduledAt;
    if (pastStart.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)) {
      expect(today.find((r) => r.id === pastId)).toMatchObject({ hasSummary: true });
    }
    for (const row of today) expect(row.hasSummary).toBe(row.id === pastId);

    // The member still reads the same text from their side.
    const member = await request(app).get(`/coaching/bookings/${pastId}/summary`).set("Authorization", `Bearer ${token}`);
    expect(member.body.summaryText).toBe("Squats felt strong. Add a set next week.");
  });

  it("CS3 another coach, a member token and an unknown booking can't read it", async () => {
    const other = await request(app).get(`/professionals/me/bookings/${pastId}/summary`).set("Authorization", `Bearer ${otherCoachToken}`);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe("booking_not_found");
    const asMember = await request(app).get(`/professionals/me/bookings/${pastId}/summary`).set("Authorization", `Bearer ${token}`);
    expect(asMember.status).toBe(401);
    const unknown = await request(app).get(`/professionals/me/bookings/does-not-exist/summary`).set(coach());
    expect(unknown.status).toBe(404);
  });
});
