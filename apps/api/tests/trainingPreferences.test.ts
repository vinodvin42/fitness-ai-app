import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { phaseBreakdown } from "../src/modules/workoutSessions/workoutSessions.service";
import { volumeChangePercent, weeklyConsistency } from "../src/modules/trainingAnalytics/trainingAnalytics.service";
import { contextFromEquipment, equipmentFromContext } from "../src/modules/workoutSettings/workoutSettings.service";

describe("pure helpers", () => {
  it("weeklyConsistency caps at 100 and is null without a plan", () => {
    expect(weeklyConsistency(5, 4)).toEqual({ plannedPerWeek: 5, completedThisWeek: 4, percent: 80 });
    expect(weeklyConsistency(3, 5).percent).toBe(100);
    expect(weeklyConsistency(null, 2)).toEqual({ plannedPerWeek: null, completedThisWeek: 2, percent: null });
  });
  it("volumeChangePercent needs a previous volume", () => {
    expect(volumeChangePercent(1124, 1000)).toBe(12.4);
    expect(volumeChangePercent(500, 1000)).toBe(-50);
    expect(volumeChangePercent(500, 0)).toBeNull();
  });
  it("phaseBreakdown groups by workout phase, defaulting to main", () => {
    const phases = new Map<string, "warmup" | "main" | "cooldown">([
      ["a", "warmup"],
      ["b", "main"],
    ]);
    const out = phaseBreakdown(
      [
        { exerciseId: "a", weightKg: null, reps: 10 },
        { exerciseId: "b", weightKg: 100, reps: 5 },
        { exerciseId: "zzz", weightKg: 50, reps: 10 },
      ],
      phases,
    );
    expect(out).toEqual([
      { phase: "warmup", sets: 1, volumeKg: 0 },
      { phase: "main", sets: 2, volumeKg: 1000 },
    ]);
  });
  it("equipment <-> onboarding context mapping", () => {
    expect(equipmentFromContext("home_bodyweight_only")).toEqual(["bodyweight"]);
    expect(contextFromEquipment(["dumbbells", "bands"])).toBe("home_dumbbells_bands");
    expect(contextFromEquipment(["barbell"])).toBe("full_gym");
    expect(contextFromEquipment([])).toBeNull();
  });
});

describe("Train preferences, analytics ranges and session phases", () => {
  const app = buildApp();
  let userId = "";
  let auth = "";
  const exerciseIds: string[] = [];
  let workoutId = "";
  let programId = "";

  beforeAll(async () => {
    const a = await request(app).post("/auth/signup").send({ email: uniqueEmail("tp"), password: "SomePassword1!", fullName: "TP User" });
    userId = a.body.user.id;
    auth = `Bearer ${a.body.tokens.accessToken}`;
    await prisma.onboardingProfile.create({
      data: {
        userId,
        goals: ["build_muscle"],
        trainingLevel: "beginner",
        medicalConditions: [],
        injuries: [],
        preferredTrainingDays: ["wed", "mon", "fri"],
        trainingDaysPerWeek: 3,
        equipmentContext: "home_dumbbells_bands",
        completedAt: new Date(),
      } as never,
    });
    for (const n of ["tp-warm", "tp-main"]) {
      const ex = await prisma.exercise.create({
        data: { name: `${n}-${Date.now()}`, muscleGroup: "chest", equipment: "barbell", difficulty: "beginner", instructions: ["x"], status: "published" } as never,
      });
      exerciseIds.push(ex.id);
    }
    const program = await prisma.program.create({
      data: { name: `tp-prog-${Date.now()}`, description: "d", durationWeeks: 1, priceCents: 0, type: "fitness" } as never,
    });
    programId = program.id;
    const w = await prisma.workout.create({ data: { programId, name: "TP Workout", durationMinutes: 30, intensity: "beginner" } as never });
    workoutId = w.id;
    await prisma.workoutExercise.create({ data: { workoutId, exerciseId: exerciseIds[0], phase: "warmup", order: 0, targetSets: 1, targetReps: 10 } as never });
    await prisma.workoutExercise.create({ data: { workoutId, exerciseId: exerciseIds[1], phase: "main", order: 1, targetSets: 1, targetReps: 5 } as never });
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId } });
    await prisma.workout.deleteMany({ where: { id: workoutId } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("workout settings fall back to onboarding values", async () => {
    const res = await request(app).get("/users/me/workout-settings").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.trainingDays).toEqual(["mon", "wed", "fri"]);
    expect(res.body.equipment).toEqual(["dumbbells", "bands", "bodyweight"]);
    expect(res.body.preferredDurationMinutes).toBe(45);
    expect(res.body.audioCoaching).toBe(true);
    expect(res.body.autoDeloadWeek).toBe(false);
  });

  it("editing training days/equipment writes back to the onboarding profile", async () => {
    const res = await request(app)
      .patch("/users/me/workout-settings")
      .set("Authorization", auth)
      .send({ trainingDays: ["tue", "thu", "sat", "sun"], equipment: ["barbell", "cables"], preferredDurationMinutes: 60, autoDeloadWeek: true });
    expect(res.status).toBe(200);
    expect(res.body.trainingDays).toEqual(["tue", "thu", "sat", "sun"]);
    expect(res.body.equipment).toEqual(["barbell", "cables"]);
    const profile = await prisma.onboardingProfile.findUnique({ where: { userId } });
    expect(profile?.preferredTrainingDays).toEqual(["tue", "thu", "sat", "sun"]);
    expect(profile?.trainingDaysPerWeek).toBe(4);
    expect(profile?.equipmentContext).toBe("full_gym");
    expect(profile?.sessionLengthMinutes).toBe(60);
  });

  it("rejects out-of-range preferences", async () => {
    const bad = await request(app).patch("/users/me/workout-settings").set("Authorization", auth).send({ preferredDurationMinutes: 5 });
    expect(bad.status).toBe(400);
    const badEq = await request(app).patch("/users/me/workout-settings").set("Authorization", auth).send({ equipment: ["jetpack"] });
    expect(badEq.status).toBe(400);
  });

  it("summary reports per-phase sets/volume; analytics supports the new ranges with consistency", async () => {
    const start = await request(app).post(`/workouts/${workoutId}/sessions`).set("Authorization", auth);
    expect(start.status).toBe(201);
    const sid = start.body.id;
    await request(app).post(`/workout-sessions/${sid}/sets`).set("Authorization", auth).send({ exerciseId: exerciseIds[0], setNumber: 1, reps: 10 });
    await request(app).post(`/workout-sessions/${sid}/sets`).set("Authorization", auth).send({ exerciseId: exerciseIds[1], setNumber: 1, weightKg: 100, reps: 5 });
    const done = await request(app).post(`/workout-sessions/${sid}/complete`).set("Authorization", auth);
    expect(done.status).toBe(200);

    const summary = await request(app).get(`/workout-sessions/${sid}/summary`).set("Authorization", auth);
    expect(summary.status).toBe(200);
    expect(summary.body.phases).toEqual([
      { phase: "warmup", sets: 1, volumeKg: 0 },
      { phase: "main", sets: 1, volumeKg: 500 },
    ]);

    for (const range of ["1w", "4w", "8w", "26w", "52w"]) {
      const res = await request(app).get(`/training/analytics?range=${range}`).set("Authorization", auth);
      expect(res.status).toBe(200);
      expect(res.body.weeks).toHaveLength(Number(range.replace("w", "")));
    }
    const a = await request(app).get("/training/analytics?range=4w").set("Authorization", auth);
    expect(a.body.consistency.plannedPerWeek).toBe(4);
    expect(a.body.consistency.completedThisWeek).toBe(1);
    expect(a.body.consistency.percent).toBe(25);
    expect(a.body.volumeChangePercent).toBeNull();
    expect((await request(app).get("/training/analytics?range=3w").set("Authorization", auth)).status).toBe(400);
  });
});
