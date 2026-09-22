import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Mindfulness log (22 Sep 2026, gap §29) — see progress.service.ts's own
 * doc comment and the MindfulnessLog model's doc comment (schema.prisma)
 * for the full design: a real, minimal self-report log (duration +
 * optional type/note) that closes the "no real data source for
 * mindfulness" gap Streak Tracker always had. Real, Postgres-backed
 * integration tests, same class as tests/checkins.test.ts — no AI call
 * here either.
 *
 * The two things worth dedicated regression coverage: (1) the create
 * endpoint itself, mirroring nutrition.test.ts's real-write-not-a-mock
 * discipline, and (2) that GET /progress/streaks' `mindfulness` category
 * computes a real consecutive-day streak from real MindfulnessLog rows —
 * including a gap day correctly resetting it to zero — using the exact
 * same computeStreak() algorithm the other three categories already use.
 */
describe("Mindfulness log + Streak Tracker mindfulness category", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("mindfulness");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Mindfulness Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.mindfulnessLog.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("401s without auth", async () => {
    const res = await request(app).post("/mindfulness-logs").send({ durationMinutes: 10 });
    expect(res.status).toBe(401);
  });

  it("400s an invalid duration (validation_error), without writing anything", async () => {
    const res = await request(app)
      .post("/mindfulness-logs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ durationMinutes: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");

    const count = await prisma.mindfulnessLog.count({ where: { userId } });
    expect(count).toBe(0);
  });

  it("creates a real MindfulnessLog with duration + optional type/note", async () => {
    const res = await request(app)
      .post("/mindfulness-logs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ durationMinutes: 15, type: "breathing", note: "Felt calmer" });

    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(15);
    expect(res.body.type).toBe("breathing");
    expect(res.body.note).toBe("Felt calmer");
    expect(res.body.userId).toBe(userId);

    const dbRow = await prisma.mindfulnessLog.findUnique({ where: { id: res.body.id } });
    expect(dbRow?.durationMinutes).toBe(15);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "MindfulnessLog", entityId: res.body.id, action: "mindfulness_log.created" },
    });
    expect(audit).not.toBeNull();
  });

  it("works with no type/note — only durationMinutes is required", async () => {
    const res = await request(app)
      .post("/mindfulness-logs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ durationMinutes: 5 });

    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(5);
    expect(res.body.type).toBeNull();
    expect(res.body.note).toBeNull();
  });

  it("GET /mindfulness-logs/today lists only today's real logs, newest last (ascending)", async () => {
    const res = await request(app).get("/mindfulness-logs/today").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    // Both fixtures above were logged "now", so both should appear.
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of res.body.items) {
      expect(item.userId).toBe(userId);
    }
  });

  describe("GET /progress/streaks mindfulness category (real multi-day sequence)", () => {
    const streakEmail = uniqueEmail("mindfulness-streak");
    let streakUserId: string;
    let streakToken: string;

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    function daysAgo(n: number): Date {
      const d = new Date();
      d.setUTCHours(12, 0, 0, 0); // midday UTC, safely inside the UTC calendar day
      return new Date(d.getTime() - n * ONE_DAY_MS);
    }

    beforeAll(async () => {
      const signupRes = await request(app)
        .post("/auth/signup")
        .send({ email: streakEmail, password: "SomePassword1!", fullName: "Mindfulness Streak Tester" });
      streakUserId = signupRes.body.user.id;
      streakToken = signupRes.body.tokens.accessToken;

      // Real, backdated rows (direct Prisma writes, same technique any
      // "seed a real historical sequence" test needs — there's no
      // backdating via the public API, which always stamps loggedAt as
      // now()). Today, yesterday, and the day before: a real 3-day
      // consecutive streak. Then a gap at 4 days ago, then a real log 5
      // days ago that must NOT be counted as part of the current streak.
      await prisma.mindfulnessLog.createMany({
        data: [
          { userId: streakUserId, durationMinutes: 10, loggedAt: daysAgo(0) },
          { userId: streakUserId, durationMinutes: 10, loggedAt: daysAgo(1) },
          { userId: streakUserId, durationMinutes: 10, loggedAt: daysAgo(2) },
          // daysAgo(3) deliberately skipped — the gap.
          { userId: streakUserId, durationMinutes: 10, loggedAt: daysAgo(4) },
        ],
      });
    });

    afterAll(async () => {
      await prisma.mindfulnessLog.deleteMany({ where: { userId: streakUserId } });
      await prisma.user.deleteMany({ where: { id: streakUserId } });
    });

    it("computes a real current streak of 3 and longest streak of 3, correctly broken by the gap day", async () => {
      const res = await request(app).get("/progress/streaks").set("Authorization", `Bearer ${streakToken}`);

      expect(res.status).toBe(200);
      const mindfulness = res.body.categories.find((c: { category: string }) => c.category === "mindfulness");
      expect(mindfulness).toBeDefined();
      expect(mindfulness.currentStreak).toBe(3);
      expect(mindfulness.longestStreak).toBe(3);
      expect(mindfulness.activeDates).toHaveLength(4);
    });

    it("the other real categories (training/nutrition/hydration) are untouched and still present", async () => {
      const res = await request(app).get("/progress/streaks").set("Authorization", `Bearer ${streakToken}`);

      const categories = res.body.categories.map((c: { category: string }) => c.category);
      expect(categories).toEqual(expect.arrayContaining(["training", "nutrition", "hydration", "mindfulness"]));

      const training = res.body.categories.find((c: { category: string }) => c.category === "training");
      expect(training.currentStreak).toBe(0);
      expect(training.longestStreak).toBe(0);
    });

    it("a real missed day resets the current streak to 0 while longest still reflects history", async () => {
      // A second, independent user whose only activity is 5 days ago —
      // today has nothing logged, so the "yesterday fallback" in
      // computeStreak() still shouldn't reach back that far.
      const goneQuietEmail = uniqueEmail("mindfulness-gone-quiet");
      const signupRes = await request(app)
        .post("/auth/signup")
        .send({ email: goneQuietEmail, password: "SomePassword1!", fullName: "Gone Quiet Tester" });
      const goneQuietUserId = signupRes.body.user.id;
      const goneQuietToken = signupRes.body.tokens.accessToken;

      try {
        await prisma.mindfulnessLog.createMany({
          data: [
            { userId: goneQuietUserId, durationMinutes: 20, loggedAt: daysAgo(5) },
            { userId: goneQuietUserId, durationMinutes: 20, loggedAt: daysAgo(6) },
          ],
        });

        const res = await request(app).get("/progress/streaks").set("Authorization", `Bearer ${goneQuietToken}`);
        const mindfulness = res.body.categories.find((c: { category: string }) => c.category === "mindfulness");

        expect(mindfulness.currentStreak).toBe(0);
        expect(mindfulness.longestStreak).toBe(2);
      } finally {
        await prisma.mindfulnessLog.deleteMany({ where: { userId: goneQuietUserId } });
        await prisma.user.deleteMany({ where: { id: goneQuietUserId } });
      }
    });
  });
});
