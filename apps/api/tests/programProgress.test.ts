import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import {
  buildWeekSchedule,
  computeAdherencePercent,
  currentProgramWeek,
  pickMeasurementChange,
  plannedPerWeek,
} from "../src/modules/programPurchases/programProgress.logic";

describe("programProgress.logic", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  it("derives the program week, capped at the duration", () => {
    expect(currentProgramWeek(start, 12, new Date("2026-01-01T05:00:00Z"))).toBe(1);
    expect(currentProgramWeek(start, 12, new Date("2026-01-23T00:00:00Z"))).toBe(4);
    expect(currentProgramWeek(start, 6, new Date("2026-12-01T00:00:00Z"))).toBe(6);
  });
  it("plans per week from availability, never above the workout count", () => {
    expect(plannedPerWeek(5, 4, 0)).toBe(4);
    expect(plannedPerWeek(3, 6, 0)).toBe(3);
    expect(plannedPerWeek(5, null, 2)).toBe(2);
    expect(plannedPerWeek(5, null, 0)).toBe(5);
    expect(plannedPerWeek(0, 4, 4)).toBe(0);
  });
  it("rotates the schedule and maps preferred days", () => {
    const ws = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
    const w2 = buildWeekSchedule(ws, 3, 2, ["wed", "mon", "fri"], new Set(["d"]));
    expect(w2.map((x) => x.workoutId)).toEqual(["d", "a", "b"]);
    expect(w2.map((x) => x.day)).toEqual(["mon", "wed", "fri"]);
    expect(w2[0].done).toBe(true);
    expect(buildWeekSchedule(ws, 2, 1, [], new Set()).every((x) => x.day === null)).toBe(true);
  });
  it("computes adherence and measurement change", () => {
    expect(computeAdherencePercent(6, 3, start, new Date("2026-01-15T00:00:00Z"), 12)).toBe(100);
    expect(computeAdherencePercent(3, 3, start, new Date("2026-01-15T00:00:00Z"), 12)).toBe(50);
    expect(computeAdherencePercent(0, 3, start, start, 12)).toBeNull();
    expect(pickMeasurementChange([{ w: 80 }, { w: null }, { w: 77 }], "w")).toEqual({ start: 80, current: 77 });
    expect(pickMeasurementChange([{ w: 80 }], "w")).toBeNull();
  });
});

describe("Programs: progress + my programs (Figma Programs 02-04)", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let programId: string;
  let otherProgramId: string;
  const workoutIds: string[] = [];

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("progprog"), password: "SomePassword1!", fullName: "Program Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;

    const program = await prisma.program.create({
      data: { name: `Test ${uniqueSuffix()}`, type: "fitness", description: "d", durationWeeks: 6, priceCents: 0, status: "published" },
    });
    programId = program.id;
    for (let i = 0; i < 3; i += 1) {
      const w = await prisma.workout.create({ data: { programId, name: `W${i + 1}`, order: i, durationMinutes: 30 } });
      workoutIds.push(w.id);
    }
    const other = await prisma.program.create({
      data: { name: `Other ${uniqueSuffix()}`, type: "fitness", description: "d", durationWeeks: 4, priceCents: 0, status: "published" },
    });
    otherProgramId = other.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.program.deleteMany({ where: { id: { in: [programId, otherProgramId] } } });
    await prisma.$disconnect();
  });

  const get = (path: string) => request(app).get(path).set("Authorization", `Bearer ${token}`);

  it("returns an unstarted program with a null week and no derived values", async () => {
    const res = await get(`/programs/${programId}/progress`);
    expect(res.status).toBe(200);
    expect(res.body.weekNumber).toBeNull();
    expect(res.body.plannedPerWeek).toBe(3);
    expect(res.body.adherencePercent).toBeNull();
    expect(res.body.weight).toBeNull();
    expect(res.body.nextProgram).toBeNull();
  });

  it("derives week, schedule done flags, weight change, adherence and a next-program recommendation on completion", async () => {
    const startedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (const workoutId of workoutIds) {
      await prisma.workoutSession.create({
        data: { userId, workoutId, status: "completed", startedAt, completedAt: new Date(startedAt.getTime() + 3_600_000) },
      });
    }
    await prisma.bodyMeasurement.create({ data: { userId, weightKg: 85, bodyFatPercent: 24, loggedAt: new Date(startedAt.getTime() - 3_600_000) } });
    await prisma.bodyMeasurement.create({ data: { userId, weightKg: 83.5, bodyFatPercent: 23, loggedAt: new Date(startedAt.getTime() + 7_200_000) } });

    const res = await get(`/programs/${programId}/progress`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.weekNumber).toBe(1);
    expect(res.body.completedSessionsThisWeek).toBe(3);
    expect(res.body.schedule).toHaveLength(3);
    expect(res.body.schedule.every((s: { done: boolean }) => s.done)).toBe(true);
    expect(res.body.weight).toEqual({ startKg: 85, currentKg: 83.5 });
    expect(res.body.bodyFat).toEqual({ startPercent: 24, currentPercent: 23 });
    expect(res.body.adherencePercent).toBe(100);
    expect(res.body.nextProgram).not.toBeNull();
    expect(res.body.nextProgram.id).not.toBe(programId);

    const mine = await get("/programs/mine");
    const row = mine.body.items.find((i: { program: { id: string } }) => i.program.id === programId);
    expect(row.status).toBe("completed");
    expect(row.weekNumber).toBe(1);
    expect(row.startedAt).toBeTruthy();
    expect(row.lastCompletedAt).toBeTruthy();
  });
});
