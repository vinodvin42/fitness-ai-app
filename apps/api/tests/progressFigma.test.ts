import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import {
  bmi,
  compareWeeks,
  consecutiveRuns,
  detectWeightPlateau,
  goalProgress,
  leanMassKg,
  liftProgressByExercise,
  nextLoadTarget,
  strengthTrend,
  waistToHip,
  whrBand,
} from "../src/modules/progress/progressMetrics";

/**
 * Progress (Figma section 06): extended measurements, goal progress, body
 * composition (Measured vs Estimated, scale card only after a scale sync),
 * rule-based insights, and the Timeline summary / month / report endpoints.
 * Pure rules are tested directly; the endpoints run against the real DB.
 */

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number, hour = 8) => new Date(Math.floor((Date.now() - n * DAY) / DAY) * DAY + hour * 3600000);

describe("progressMetrics (pure rules)", () => {
  it("goalProgress = (start - current) / (start - target), clamped, and null percent without a target", () => {
    const start = { weightKg: 90, at: new Date("2026-01-01") };
    expect(goalProgress(start, 84, 78)).toMatchObject({ percent: 50, remainingKg: 6, direction: "loss" });
    expect(goalProgress(start, 70, 78)).toMatchObject({ percent: 100, remainingKg: 0 });
    expect(goalProgress(start, 92, 78)).toMatchObject({ percent: 0 });
    expect(goalProgress({ weightKg: 60, at: new Date() }, 63, 66)).toMatchObject({ percent: 50, direction: "gain" });
    expect(goalProgress(start, 84, null)).toMatchObject({ percent: null, remainingKg: null, targetWeightKg: null });
    expect(goalProgress(null, 84, 78)).toBeNull();
  });

  it("derives lean mass / BMI / waist-hip only when every input exists", () => {
    expect(leanMassKg(80, 25)).toBe(60);
    expect(leanMassKg(80, null)).toBeNull();
    expect(leanMassKg(null, 25)).toBeNull();
    expect(bmi(80, 180)).toBe(24.7);
    expect(bmi(80, null)).toBeNull();
    expect(waistToHip(90, 100)).toBe(0.9);
    expect(waistToHip(90, null)).toBeNull();
    expect(whrBand(0.94, "male")).toBe("Above WHO threshold");
    expect(whrBand(0.8, "female")).toBe("Healthy range");
    expect(whrBand(0.8, null)).toBeNull();
  });

  const now = new Date("2026-10-06T12:00:00Z");
  const wk = (n: number) => new Date(now.getTime() - n * 7 * DAY);

  it("detects a weight plateau only with a loss goal, >=3 weekly weigh-ins and <=0.3 kg spread", () => {
    const flat = [wk(3), wk(2), wk(1), wk(0)].map((d, i) => ({ weightKg: [84.2, 84.1, 84.3, 84.2][i], loggedAt: d }));
    const first = { weightKg: 90, loggedAt: wk(10) };
    expect(detectWeightPlateau([first, ...flat], 78, now)).toMatchObject({ weeks: 4, rangeKg: 0.2 });
    expect(detectWeightPlateau([first, ...flat], null, now)).toBeNull(); // no goal
    expect(detectWeightPlateau([first, ...flat], 90, now)).toBeNull(); // not a loss goal
    const moving = [wk(3), wk(2), wk(1), wk(0)].map((d, i) => ({ weightKg: [85.5, 85, 84.6, 84.1][i], loggedAt: d }));
    expect(detectWeightPlateau([first, ...moving], 78, now)).toBeNull();
    // only two weekly weigh-ins -> never enough data
    expect(detectWeightPlateau([first, { weightKg: 84, loggedAt: wk(1) }, { weightKg: 84, loggedAt: wk(0) }], 78, now)).toBeNull();
  });

  it("compareWeeks needs >=3 values in each 7-day window", () => {
    const recent = [0, 1, 2].map((d) => ({ at: new Date(now.getTime() - d * DAY), value: 6 }));
    const prev = [8, 9, 10].map((d) => ({ at: new Date(now.getTime() - d * DAY), value: 7.5 }));
    expect(compareWeeks([...recent, ...prev], now)).toMatchObject({ recentAvg: 6, previousAvg: 7.5, changePercent: -20 });
    expect(compareWeeks([...recent, prev[0], prev[1]], now)).toBeNull();
  });

  it("builds PR history from the best set per session and ranks the strongest recent trend", () => {
    const mk = (sessionId: string, daysBack: number, kg: number, reps: number) => ({
      exerciseId: "bench",
      exerciseName: "Bench Press",
      sessionId,
      at: new Date(now.getTime() - daysBack * DAY),
      weightKg: kg,
      reps,
    });
    const lifts = liftProgressByExercise([
      mk("s1", 30, 60, 10),
      mk("s1", 30, 55, 12), // lighter set in the same session is ignored
      mk("s2", 20, 60, 12), // same weight: not a PR
      mk("s3", 10, 80, 8),
      mk("s4", 2, 85, 8),
    ]);
    expect(lifts).toHaveLength(1);
    expect(lifts[0].improvements.map((i) => i.weightKg)).toEqual([60, 80, 85]);
    expect(lifts[0]).toMatchObject({ firstKg: 60, previousKg: 80, currentKg: 85 });
    const trend = strengthTrend(lifts, now);
    expect(trend).toMatchObject({ exerciseName: "Bench Press", fromKg: 60, toKg: 85, improvements: 3 });
    expect(nextLoadTarget(100)).toBe(105);
  });

  it("finds runs of consecutive qualifying days", () => {
    const d = (n: number, v: number) => ({ date: new Date(Date.UTC(2026, 8, n)), value: v });
    const days = [...[1, 2, 3, 4, 5, 6, 7].map((n) => d(n, 7.5)), d(8, 5), d(9, 8), d(10, 8)];
    const runs = consecutiveRuns(days, (v) => v >= 7, 7);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ length: 7, avg: 7.5 });
  });
});

describe("Progress endpoints", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;
  const programIds: string[] = [];
  const exerciseIds: string[] = [];
  const deviceIds: string[] = [];

  beforeAll(async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("progfig"), password: "SomePassword1!", fullName: "Progress Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.workout.deleteMany({ where: { programId: { in: programIds } } });
    await prisma.program.deleteMany({ where: { id: { in: programIds } } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    await prisma.$disconnect();
  });

  it("stores the extended tape measurements and rejects out-of-range values", async () => {
    const ok = await request(app)
      .post("/measurements")
      .set("Authorization", auth)
      .send({ neckCm: 38.5, shouldersCm: 118, bicepLeftCm: 35, bicepRightCm: 35.5, calfLeftCm: 38, forearmRightCm: 28.5, thighLeftCm: 58 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ neckCm: 38.5, shouldersCm: 118, bicepRightCm: 35.5, thighLeftCm: 58, source: "manual" });
    const bad = await request(app).post("/measurements").set("Authorization", auth).send({ neckCm: 0 });
    expect(bad.status).toBe(400);
    const list = await request(app).get("/measurements").set("Authorization", auth);
    expect(list.body.items[0].calfLeftCm).toBe(38);
    await prisma.bodyMeasurement.deleteMany({ where: { userId } });
  });

  it("overview goal: no ring without a goal weight, real percent once one is set", async () => {
    await prisma.bodyMeasurement.createMany({
      data: [
        { userId, weightKg: 90, loggedAt: daysAgo(60) },
        { userId, weightKg: 84, loggedAt: daysAgo(1) },
      ],
    });
    const noGoal = await request(app).get("/progress/overview").set("Authorization", auth);
    expect(noGoal.body.goal).toMatchObject({ startWeightKg: 90, currentWeightKg: 84, targetWeightKg: null, percent: null });

    await prisma.onboardingProfile.upsert({
      where: { userId },
      create: { userId, goals: [], targetWeightKg: 78, heightCm: 180, gender: "male", completedAt: new Date() },
      update: { targetWeightKg: 78, heightCm: 180, gender: "male" },
    });
    const withGoal = await request(app).get("/progress/overview").set("Authorization", auth);
    expect(withGoal.body.goal).toMatchObject({ percent: 50, remainingKg: 6, direction: "loss" });
    expect(withGoal.body.weightHistory).toHaveLength(2);
  });

  it("composition labels derived values Estimated and only shows the scale card after a scale syncs data", async () => {
    await prisma.bodyMeasurement.create({
      data: { userId, weightKg: 84, bodyFatPercent: 25, waistCm: 90, hipsCm: 100, loggedAt: daysAgo(0, 9) },
    });
    const comp = await request(app).get("/progress/composition").set("Authorization", auth);
    expect(comp.status).toBe(200);
    expect(comp.body.latest.bodyFatPercent).toMatchObject({ value: 25, evidence: "measured" });
    expect(comp.body.latest.leanMassKg).toMatchObject({ value: 63, evidence: "estimated" });
    expect(comp.body.latest.bmi).toMatchObject({ value: 25.9, band: "Overweight", evidence: "estimated" });
    expect(comp.body.latest.waistToHip).toMatchObject({ value: 0.9, band: "Healthy range", evidence: "estimated" });
    expect(comp.body.scale).toBeNull();

    const pair = await request(app).post("/devices").set("Authorization", auth).send({ provider: "fitbit", name: "Test Scale", kind: "scale" });
    expect(pair.status).toBe(201);
    deviceIds.push(pair.body.id);
    // connected but nothing synced yet -> still no scale card
    expect((await request(app).get("/progress/composition").set("Authorization", auth)).body.scale).toBeNull();

    const today = new Date().toISOString().slice(0, 10);
    const sync = await request(app)
      .post(`/devices/${pair.body.id}/sync`)
      .set("Authorization", auth)
      .send({ samples: [{ date: today, weightKg: 83.4, bodyFatPercent: 24.1 }] });
    expect(sync.status).toBe(200);
    const after = await request(app).get("/progress/composition").set("Authorization", auth);
    expect(after.body.scale).toMatchObject({ deviceName: "Test Scale", latestWeightKg: 83.4, latestBodyFatPercent: 24.1 });
    const rows = await request(app).get("/measurements").set("Authorization", auth);
    expect(rows.body.items.some((m: { source: string; deviceName: string }) => m.source === "device" && m.deviceName === "Test Scale")).toBe(true);
  });

  it("scale readings from a non-scale device are not ingested as body measurements", async () => {
    const pair = await request(app).post("/devices").set("Authorization", auth).send({ provider: "oura", name: "Test Ring", kind: "ring" });
    const before = await prisma.bodyMeasurement.count({ where: { userId } });
    await request(app)
      .post(`/devices/${pair.body.id}/sync`)
      .set("Authorization", auth)
      .send({ samples: [{ date: new Date().toISOString().slice(0, 10), weightKg: 70, restingHr: 60 }] });
    expect(await prisma.bodyMeasurement.count({ where: { userId } })).toBe(before);
  });

  it("insights: empty for thin data, then plateau + sleep + recovery cards from real logs", async () => {
    // Clean slate for this user's logs, then only 2 weigh-ins and nothing else.
    await prisma.bodyMeasurement.deleteMany({ where: { userId } });
    await prisma.bodyMeasurement.createMany({
      data: [
        { userId, weightKg: 90, loggedAt: daysAgo(70) },
        { userId, weightKg: 84, loggedAt: daysAgo(1) },
      ],
    });
    const thin = await request(app).get("/progress/insights").set("Authorization", auth);
    expect(thin.status).toBe(200);
    expect(thin.body.cards.map((c: { kind: string }) => c.kind)).toEqual(["goal"]);
    expect(thin.body.disclaimer).toMatch(/not medical diagnosis/i);

    // Four flat weekly weigh-ins -> plateau; sleep dip; high soreness.
    await prisma.bodyMeasurement.deleteMany({ where: { userId } });
    await prisma.bodyMeasurement.createMany({
      data: [
        { userId, weightKg: 90, loggedAt: daysAgo(70) },
        { userId, weightKg: 84.2, loggedAt: daysAgo(22) },
        { userId, weightKg: 84.1, loggedAt: daysAgo(15) },
        { userId, weightKg: 84.3, loggedAt: daysAgo(8) },
        { userId, weightKg: 84.2, loggedAt: daysAgo(1) },
      ],
    });
    for (let d = 0; d < 14; d++) {
      const fields = { sleepHours: d < 7 ? 6 : 7.5, soreness: d < 7 ? 5 : 2, energyLevel: d < 7 ? 2 : 4 };
      await prisma.recoveryLog.upsert({
        where: { userId_date: { userId, date: daysAgo(d, 0) } },
        create: { userId, date: daysAgo(d, 0), ...fields },
        update: fields,
      });
    }
    const res = await request(app).get("/progress/insights").set("Authorization", auth);
    const kinds = res.body.cards.map((c: { kind: string }) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["goal", "plateau", "sleep", "recovery_tip"]));
    expect(kinds).not.toContain("strength"); // no lifting logged -> no strength card
    const sleep = res.body.cards.find((c: { kind: string }) => c.kind === "sleep");
    expect(sleep.body).toMatch(/dipped 20%/);
  });

  it("timeline: PR history with previous values, baseline start event, summary, month detail and report", async () => {
    const ex = await prisma.exercise.create({
      data: { name: `Bench-${Date.now()}`, muscleGroup: "chest", equipment: "barbell", difficulty: "beginner", instructions: ["x"], status: "published" } as never,
    });
    exerciseIds.push(ex.id);
    const program = await prisma.program.create({
      data: { name: `Prog ${Date.now()}`, type: "fitness", description: "d", durationWeeks: 4, status: "published" },
    });
    programIds.push(program.id);
    const workout = await prisma.workout.create({ data: { programId: program.id, name: "Push Day", durationMinutes: 40, intensity: "beginner" } });

    for (const [back, kg, reps] of [
      [40, 60, 10],
      [20, 80, 8],
      [5, 100, 8],
    ] as const) {
      const started = daysAgo(back, 17);
      const s = await prisma.workoutSession.create({
        data: { userId, workoutId: workout.id, status: "completed", startedAt: started, completedAt: new Date(started.getTime() + 3600000) },
      });
      await prisma.exerciseSetLog.create({ data: { sessionId: s.id, exerciseId: ex.id, setNumber: 1, weightKg: kg, reps, loggedAt: started } });
    }

    const tl = await request(app).get("/timeline").set("Authorization", auth);
    expect(tl.status).toBe(200);
    const prs = tl.body.items.filter((e: { type: string }) => e.type === "pr");
    expect(prs).toHaveLength(3);
    const latest = prs[0];
    expect(latest).toMatchObject({ category: "strength", evidence: "measured", source: "Workout log", context: expect.stringContaining("Push Day") });
    expect(latest.title).toContain("100kg × 8");
    expect(latest.progression).toMatchObject({
      unit: "kg",
      first: { value: 60 },
      previous: { value: 80 },
      current: { value: 100 },
      percentChange: 25,
      nextTarget: 105,
    });
    expect(tl.body.items.some((e: { type: string }) => e.type === "start")).toBe(true);

    const summary = await request(app).get("/timeline/summary").set("Authorization", auth);
    expect(summary.status).toBe(200);
    expect(summary.body.milestones).toBeGreaterThanOrEqual(3);
    expect(summary.body.memberSince).toBeTruthy();
    expect(summary.body.insight).toMatch(/Weight changed from 90 kg to 84.2 kg/);

    const d = daysAgo(5);
    const month = await request(app).get(`/timeline/months/${d.getUTCFullYear()}/${d.getUTCMonth()}`).set("Authorization", auth);
    expect(month.status).toBe(200);
    expect(month.body.workouts).toBeGreaterThanOrEqual(1);
    expect(month.body.events.some((e: { type: string }) => e.type === "pr")).toBe(true);
    expect((await request(app).get("/timeline/months/2026/13").set("Authorization", auth)).status).toBe(400);

    const report = await request(app).get("/timeline/report").set("Authorization", auth);
    expect(report.status).toBe(200);
    expect(report.body.summaryTitle).toContain("Progress Tester");
    expect(report.body.sections.map((s: { id: string }) => s.id)).toEqual(["body", "strength", "cardio", "health", "consistency"]);
    const strength = report.body.sections.find((s: { id: string }) => s.id === "strength");
    expect(strength.lines.some((l: { text: string }) => /60 to 100 kg/.test(l.text))).toBe(true);
    const body = report.body.sections.find((s: { id: string }) => s.id === "body");
    expect(body.lines.every((l: { evidence: string }) => l.evidence === "measured" || l.evidence === "estimated")).toBe(true);
    const cardio = report.body.sections.find((s: { id: string }) => s.id === "cardio");
    expect(cardio.lines.some((l: { text: string }) => /Runs:/.test(l.text))).toBe(false); // no runs logged -> nothing invented
    expect(report.body.disclaimer).toMatch(/not medical diagnosis/i);
  });
});
