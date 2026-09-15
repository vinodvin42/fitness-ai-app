import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Check-In (R1 Developer 1 U5, 15 Sep 2026) — see the CheckIn model's own
 * doc comment (schema.prisma) and progress.service.ts's Check-In section
 * for the full design. Real, Postgres-backed integration tests (no mocks
 * — there's no AI call here, unlike plans.test.ts/nutrition.test.ts).
 *
 * The core thing worth a dedicated regression test: "at most one Check-In
 * per user per real period" is enforced by a genuine DB unique constraint
 * (`@@unique([userId, period, periodKey])`), not a pre-insert existence
 * check the API layer could race on — see the "two truly concurrent
 * submits" test below, same class of regression coverage
 * paymentsActivationRace.test.ts and nutrition.test.ts's own concurrent-
 * confirm test already established for this codebase's other "claim
 * once" endpoints.
 */
describe("Check-In (Daily / weekly)", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("checkin");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Check-In Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.checkIn.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("GET /check-ins/status reports neither period submitted before any check-in exists", async () => {
    const res = await request(app).get("/check-ins/status").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.daily).toEqual({ submitted: false, checkIn: null });
    expect(res.body.weekly).toEqual({ submitted: false, checkIn: null });
  });

  it("submits a real daily check-in, with a YYYY-MM-DD periodKey stamped server-side", async () => {
    const res = await request(app)
      .post("/check-ins")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "daily", energy: 4, soreness: 2, adherence: 5, note: "Felt good today" });

    expect(res.status).toBe(201);
    expect(res.body.period).toBe("daily");
    expect(res.body.periodKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.energy).toBe(4);
    expect(res.body.soreness).toBe(2);
    expect(res.body.adherence).toBe(5);
    expect(res.body.note).toBe("Felt good today");
  });

  it("GET /check-ins/status now reports the daily period submitted, weekly still not", async () => {
    const res = await request(app).get("/check-ins/status").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.daily.submitted).toBe(true);
    expect(res.body.daily.checkIn.energy).toBe(4);
    expect(res.body.weekly.submitted).toBe(false);
  });

  it("409s a second daily submission for the same real day (sequential)", async () => {
    const res = await request(app)
      .post("/check-ins")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "daily", energy: 3, soreness: 3, adherence: 3 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("check_in_already_submitted");
  });

  it("a weekly check-in is independent of the daily one already submitted", async () => {
    const res = await request(app)
      .post("/check-ins")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "weekly", energy: 5, soreness: 1, adherence: 4, note: "Good week overall" });

    expect(res.status).toBe(201);
    expect(res.body.period).toBe("weekly");
    expect(res.body.periodKey).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("GET /check-ins lists both real submitted entries, newest first", async () => {
    const res = await request(app).get("/check-ins").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].period).toBe("weekly");
    expect(res.body.items[1].period).toBe("daily");
  });

  it("400s an out-of-range rating (validation_error), without writing anything", async () => {
    const res = await request(app)
      .post("/check-ins")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "daily", energy: 6, soreness: 2, adherence: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("two truly concurrent submits for the same fresh period produce exactly one 201 and one 409 — not just the sequential case above", async () => {
    // A second, independent user — the periods already claimed by the
    // fixture user above must not interfere with this race.
    const email = uniqueEmail("checkin-race");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Check-In Race Tester" });
    const raceUserId = signupRes.body.user.id;
    const raceToken = signupRes.body.tokens.accessToken;

    try {
      const [first, second] = await Promise.all([
        request(app)
          .post("/check-ins")
          .set("Authorization", `Bearer ${raceToken}`)
          .send({ period: "daily", energy: 3, soreness: 3, adherence: 3 }),
        request(app)
          .post("/check-ins")
          .set("Authorization", `Bearer ${raceToken}`)
          .send({ period: "daily", energy: 5, soreness: 1, adherence: 5 }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      const rows = await prisma.checkIn.findMany({ where: { userId: raceUserId, period: "daily" } });
      expect(rows).toHaveLength(1);
    } finally {
      await prisma.checkIn.deleteMany({ where: { userId: raceUserId } });
      await prisma.user.deleteMany({ where: { id: raceUserId } });
    }
  });

  it("401s without auth", async () => {
    const res = await request(app).get("/check-ins/status");
    expect(res.status).toBe(401);
  });
});
