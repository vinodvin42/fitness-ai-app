import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { computeReadiness, ReadinessLogInput } from "../src/modules/recovery/readiness";

/**
 * Figma "02 - Today" backing endpoints: GET /recovery/readiness (honest
 * readiness score incl. the null cases), notification dismiss + category
 * filter, GET /workouts/trending, and OnboardingProfile.targetWeightKg.
 */

const NOW = new Date("2026-10-06T08:00:00Z");
const log = (daysAgo: number, v: Partial<ReadinessLogInput> = {}): ReadinessLogInput => ({
  date: new Date(Date.UTC(2026, 9, 6 - daysAgo)),
  restingHeartRate: null,
  sleepHours: null,
  hrvMs: null,
  soreness: null,
  energyLevel: null,
  ...v,
});

describe("computeReadiness (pure formula)", () => {
  it("returns null + reason with no log", () => {
    const r = computeReadiness(null, [], NOW);
    expect(r.score).toBeNull();
    expect(r.reason).toMatch(/No recovery data/);
  });

  it("returns null when the newest log is stale", () => {
    const r = computeReadiness(log(3, { sleepHours: 8, energyLevel: 5, soreness: 1 }), [], NOW);
    expect(r.score).toBeNull();
    expect(r.reason).toMatch(/more than a day old/);
  });

  it("returns null when fewer than 3 components are available", () => {
    const r = computeReadiness(log(0, { sleepHours: 8, energyLevel: 5 }), [], NOW);
    expect(r.score).toBeNull();
    expect(r.components).toHaveLength(2);
  });

  it("HRV / resting HR only count with >= 3 baseline days", () => {
    const base = [log(1, { hrvMs: 50 }), log(2, { hrvMs: 50 })];
    const r = computeReadiness(log(0, { sleepHours: 8, energyLevel: 5, hrvMs: 50 }), base, NOW);
    expect(r.score).toBeNull(); // hrv dropped -> only sleep + energy
  });

  it("scores a strong day as Ready to Train", () => {
    const base = [1, 2, 3, 4].map((d) => log(d, { hrvMs: 50, restingHeartRate: 60 }));
    const r = computeReadiness(
      log(0, { sleepHours: 8.2, hrvMs: 55, restingHeartRate: 58, energyLevel: 5, soreness: 1 }),
      base,
      NOW,
    );
    expect(r.band).toBe("ready");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.components.map((c) => c.key).sort()).toEqual(["energy", "hrv", "restingHr", "sleep", "soreness"]);
  });

  it("scores a rough day low and renormalises over available components", () => {
    const r = computeReadiness(log(0, { sleepHours: 4, energyLevel: 2, soreness: 5 }), [], NOW);
    // sleep 50, energy 25, soreness 0 -> (50*.3 + 25*.15 + 0) / .6 = 31
    expect(r.score).toBe(31);
    expect(r.band).toBe("rest");
  });
});

describe("Today Figma endpoints (real DB)", () => {
  const app = buildApp();
  let userId: string;
  let otherUserId: string;
  let token: string;
  let otherToken: string;
  const programIds: string[] = [];

  beforeAll(async () => {
    const a = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("todayfig"), password: "SomePassword1!", fullName: "Today Tester" });
    userId = a.body.user.id;
    token = a.body.tokens.accessToken;
    const b = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("todayfig-other"), password: "SomePassword1!", fullName: "Other Tester" });
    otherUserId = b.body.user.id;
    otherToken = b.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId } });
    await prisma.program.deleteMany({ where: { id: { in: programIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  describe("GET /recovery/readiness", () => {
    it("401s without auth", async () => {
      expect((await request(app).get("/recovery/readiness")).status).toBe(401);
    });

    it("returns a null score with a reason when nothing is logged", async () => {
      const res = await request(app).get("/recovery/readiness").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.score).toBeNull();
      expect(res.body.reason).toBeTruthy();
      expect(res.body.source).toBeNull();
      expect(res.body.basis).toBe("Based on your logged data");
    });

    it("computes a score from real logs and reports a manual source", async () => {
      const day = (n: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - n));
      for (const n of [1, 2, 3, 4]) {
        await prisma.recoveryLog.create({ data: { userId, date: day(n), hrvMs: 50, restingHeartRate: 60 } });
      }
      await prisma.recoveryLog.create({
        data: { userId, date: day(0), sleepHours: 8, hrvMs: 52, restingHeartRate: 59, energyLevel: 4, soreness: 2 },
      });
      const res = await request(app).get("/recovery/readiness").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.score).toBeGreaterThan(75);
      expect(res.body.headline).toBe("Ready to Train");
      expect(res.body.source.kind).toBe("manual");
      expect(res.body.metrics.sleepHours).toBe(8);
    });
  });

  describe("notifications: category filter + dismiss", () => {
    const ids: Record<string, string> = {};
    beforeAll(async () => {
      for (const kind of ["workout", "nutrition", "coach"] as const) {
        const n = await prisma.notification.create({ data: { userId, kind, title: `t-${kind}`, body: `b-${kind}` } });
        ids[kind] = n.id;
      }
    });

    it("filters by category", async () => {
      const w = await request(app).get("/notifications?category=workouts").set("Authorization", `Bearer ${token}`);
      expect(w.body.items.map((n: { kind: string }) => n.kind)).toEqual(["workout"]);
      const n = await request(app).get("/notifications?category=nutrition").set("Authorization", `Bearer ${token}`);
      expect(n.body.items.map((x: { kind: string }) => x.kind)).toEqual(["nutrition"]);
      const bad = await request(app).get("/notifications?category=bogus").set("Authorization", `Bearer ${token}`);
      expect(bad.status).toBe(400);
    });

    it("dismiss hides the row and drops it from the unread count", async () => {
      const before = await request(app).get("/notifications").set("Authorization", `Bearer ${token}`);
      expect(before.body.items).toHaveLength(3);
      expect(before.body.unreadCount).toBe(3);

      const res = await request(app).post(`/notifications/${ids.coach}/dismiss`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: ids.coach, dismissed: true });

      const after = await request(app).get("/notifications").set("Authorization", `Bearer ${token}`);
      expect(after.body.items.map((n: { id: string }) => n.id)).not.toContain(ids.coach);
      expect(after.body.unreadCount).toBe(2);

      // Idempotent, and the row is retained (soft dismiss).
      const again = await request(app).post(`/notifications/${ids.coach}/dismiss`).set("Authorization", `Bearer ${token}`);
      expect(again.status).toBe(200);
      const row = await prisma.notification.findUnique({ where: { id: ids.coach } });
      expect(row?.dismissedAt).not.toBeNull();
    });

    it("404s dismissing someone else's notification", async () => {
      const res = await request(app).post(`/notifications/${ids.workout}/dismiss`).set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /workouts/trending", () => {
    it("returns a workout (most started, else featured) plus real catalog counts", async () => {
      const program = await prisma.program.create({
        data: { name: `Trend Prog ${Date.now()}`, type: "fitness", description: "d", durationWeeks: 4, status: "published" },
      });
      programIds.push(program.id);
      const workout = await prisma.workout.create({
        data: { programId: program.id, name: "Trend Workout", durationMinutes: 35, intensity: "beginner" },
      });
      await prisma.workoutSession.create({ data: { userId, workoutId: workout.id } });

      const res = await request(app).get("/workouts/trending").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.workout).toMatchObject({ id: expect.any(String), name: expect.any(String), durationMinutes: expect.any(Number) });
      expect(["most_started_30d", "featured"]).toContain(res.body.basis);
      expect(res.body.catalog.workouts).toBeGreaterThanOrEqual(1);
      if (res.body.basis === "most_started_30d") expect(res.body.startCount).toBeGreaterThanOrEqual(1);
    });

    it("is not shadowed by /workouts/:id", async () => {
      const res = await request(app).get("/workouts/trending").set("Authorization", `Bearer ${token}`);
      expect(res.body.error?.code).not.toBe("workout_not_found");
    });
  });

  describe("targetWeightKg", () => {
    it("can be set via onboarding, edited and cleared", async () => {
      const put = await request(app)
        .put("/users/me/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send({
          dateOfBirth: "1995-04-12",
          weightKg: 80,
          targetWeightKg: 75,
          heightCm: 178,
          goals: ["lose_fat"],
          allergens: [],
          medicalConditions: [],
          injuries: [],
          preferredTrainingDays: ["mon", "wed"],
        });
      expect(put.status).toBeLessThan(300);
      const got = await request(app).get("/users/me/onboarding").set("Authorization", `Bearer ${token}`);
      expect(got.body.onboardingProfile.targetWeightKg).toBe(75);

      const edit = await request(app)
        .patch("/users/me/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send({ targetWeightKg: 72.5 });
      expect(edit.body.onboardingProfile.targetWeightKg).toBe(72.5);

      const clear = await request(app)
        .patch("/users/me/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send({ targetWeightKg: null });
      expect(clear.body.onboardingProfile.targetWeightKg).toBeNull();
    });
  });
});
