import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * "How was your session?" (Figma coach/11, 24 Oct 2026): a private 1-5
 * rating of a session that has started, with optional tags and comment. Only
 * that coach sees it; it is never public.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Session rating", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let professionalId: string;
  let otherProfessionalId: string;
  let coachToken: string;
  let otherCoachToken: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  let pastId: string;
  let futureId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const hours = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000);

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("session-rating"), password: "RatingPassword1!", fullName: "Rating Member" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;

    const coach = async (tag: string) =>
      prisma.professional.create({
        data: {
          email: `rating-${tag}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Rating Coach ${tag}`,
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      });
    const c1 = await coach("one");
    const c2 = await coach("two");
    professionalId = c1.id;
    otherProfessionalId = c2.id;
    coachToken = signProfessionalAccessToken({ sub: c1.id, email: c1.email }).token;
    otherCoachToken = signProfessionalAccessToken({ sub: c2.id, email: c2.email }).token;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 1800, durationMinutes: 60, label: "Rating Session" });
    const base = { userId, professionalId, offeringId: pricing.offering.id, durationMinutes: 60, priceCents: 1800, commissionPct: 20, status: "confirmed" as const };
    pastId = (await prisma.booking.create({ data: { ...base, scheduledAt: hours(-3) } })).id;
    futureId = (await prisma.booking.create({ data: { ...base, scheduledAt: hours(24) } })).id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: { in: [professionalId, otherProfessionalId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("S1 a finished session starts unrated; a future one can't be rated yet", async () => {
    expect((await request(app).get(`/coaching/bookings/${pastId}/rating`).set(auth())).body.rating).toBeNull();
    const early = await request(app).put(`/coaching/bookings/${futureId}/rating`).set(auth()).send({ stars: 5 });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("session_not_started");
  });

  it("S2 the member rates it, then changes their answer; one rating per session", async () => {
    const first = await request(app)
      .put(`/coaching/bookings/${pastId}/rating`)
      .set(auth())
      .send({ stars: 4, tags: ["clear_guidance", "on_time", "on_time"], comment: "  Helpful  " });
    expect(first.status).toBe(200);
    expect(first.body.rating).toMatchObject({ stars: 4, tags: ["clear_guidance", "on_time"], comment: "Helpful" });
    await request(app).put(`/coaching/bookings/${pastId}/rating`).set(auth()).send({ stars: 5, tags: [] });
    expect((await request(app).get(`/coaching/bookings/${pastId}/rating`).set(auth())).body.rating).toMatchObject({ stars: 5, tags: [], comment: null });
    expect(await prisma.sessionRating.count({ where: { bookingId: pastId } })).toBe(1);
  });

  it("S3 bad input is refused", async () => {
    const put = (body: object) => request(app).put(`/coaching/bookings/${pastId}/rating`).set(auth()).send(body);
    expect((await put({ stars: 6 })).status).toBe(400);
    expect((await put({ stars: 3, tags: ["rude"] })).status).toBe(400);
    expect((await put({ stars: 3, comment: "x".repeat(1001) })).status).toBe(400);
  });

  it("S4 only that coach sees it, with the average", async () => {
    const mine = await request(app).get("/professionals/me/ratings").set("Authorization", `Bearer ${coachToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ count: 1, average: 5 });
    expect(mine.body.items[0]).toMatchObject({ bookingId: pastId, clientFullName: "Rating Member", stars: 5 });
    const filtered = await request(app).get("/professionals/me/ratings").query({ clientId: userId }).set("Authorization", `Bearer ${coachToken}`);
    expect(filtered.body.count).toBe(1);
    const other = await request(app).get("/professionals/me/ratings").set("Authorization", `Bearer ${otherCoachToken}`);
    expect(other.body).toMatchObject({ count: 0, average: null, items: [] });
  });
});
