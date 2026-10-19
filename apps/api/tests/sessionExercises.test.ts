import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { withOneSetType } from "../src/modules/workoutSets/workoutSets.service";
import { workingVolumeKg } from "../src/modules/workoutSessions/workoutSessions.service";

/**
 * Batch 3a (owner-approved 18 Oct 2026; Figma 03b fast logging): a session's
 * own exercise list (seeded on start; add, swap, superset, reorder, remove),
 * drop vs failure sets, per-exercise rest, "How did it feel?", and warm-ups
 * left out of volume and personal records. Fixtures are created directly via
 * Prisma, like trainingPreferences.test.ts.
 */

describe("pure helpers", () => {
  it("turning one set type on turns the other two off; other edits pass through", () => {
    expect(withOneSetType({ isFailure: true })).toEqual({ isWarmup: false, isDropSet: false, isFailure: true });
    expect(withOneSetType({ reps: 8 })).toEqual({ reps: 8 });
    expect(withOneSetType({ isDropSet: false })).toEqual({ isDropSet: false });
  });
  it("working volume ignores warm-ups", () => {
    expect(workingVolumeKg([{ weightKg: 20, reps: 10, isWarmup: true }, { weightKg: 50, reps: 5 }, { weightKg: null, reps: 10 }])).toBe(250);
  });
});

describe("Session exercise list, set types, rest and feel", () => {
  const app = buildApp();
  let userId = "";
  let auth = "";
  const ex: string[] = [];
  let workoutId = "";
  let programId = "";

  const start = async () => {
    const res = await request(app).post(`/workouts/${workoutId}/sessions`).set("Authorization", auth);
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const getSession = (sid: string) => request(app).get(`/workout-sessions/${sid}`).set("Authorization", auth);
  const logSet = (sid: string, body: Record<string, unknown>) =>
    request(app).post(`/workout-sessions/${sid}/sets`).set("Authorization", auth).send(body);

  beforeAll(async () => {
    const a = await request(app).post("/auth/signup").send({ email: uniqueEmail("sx"), password: "SomePassword1!", fullName: "Session Exercises User" });
    userId = a.body.user.id;
    auth = `Bearer ${a.body.tokens.accessToken}`;
    for (const n of ["sx-warm", "sx-bench", "sx-row", "sx-curl", "sx-draft"]) {
      const e = await prisma.exercise.create({
        data: {
          name: `${n}-${Date.now()}`,
          muscleGroup: "chest",
          equipment: "Dumbbell",
          difficulty: "beginner",
          instructions: ["x"],
          status: n === "sx-draft" ? "draft" : "published",
        } as never,
      });
      ex.push(e.id);
    }
    const program = await prisma.program.create({
      data: { name: `sx-prog-${Date.now()}`, description: "d", durationWeeks: 1, priceCents: 0, type: "fitness" } as never,
    });
    programId = program.id;
    const w = await prisma.workout.create({ data: { programId, name: "SX Workout", durationMinutes: 30, intensity: "beginner" } as never });
    workoutId = w.id;
    // Inserted out of display order on purpose: the list must come back warm-up first, then main by `order`.
    await prisma.workoutExercise.create({ data: { workoutId, exerciseId: ex[2], phase: "main", order: 2, targetSets: 3, targetReps: 10 } as never });
    await prisma.workoutExercise.create({ data: { workoutId, exerciseId: ex[1], phase: "main", order: 1, targetSets: 4, targetReps: 10 } as never });
    await prisma.workoutExercise.create({ data: { workoutId, exerciseId: ex[0], phase: "warmup", order: 5, targetSets: 1, targetReps: 15 } as never });
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId } });
    await prisma.exerciseRestPreference.deleteMany({ where: { userId } });
    await prisma.workout.deleteMany({ where: { id: workoutId } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.exercise.deleteMany({ where: { id: { in: ex } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("starting a session copies the workout into its own list, in display order, with the default rest", async () => {
    const sid = await start();
    const res = await getSession(sid);
    expect(res.status).toBe(200);
    expect(res.body.exercises.map((e: { exerciseId: string }) => e.exerciseId)).toEqual([ex[0], ex[1], ex[2]]);
    expect(res.body.exercises.map((e: { order: number }) => e.order)).toEqual([0, 1, 2]);
    expect(res.body.exercises[1]).toMatchObject({ source: "plan", targetSets: 4, restSeconds: 90, supersetGroup: null });
    expect(res.body.exercises[1].exercise.id).toBe(ex[1]);
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("a pre-existing in-progress session with no list gets it on first read", async () => {
    const legacy = await prisma.workoutSession.create({ data: { userId, workoutId } });
    expect(await prisma.workoutSessionExercise.count({ where: { sessionId: legacy.id } })).toBe(0);
    const res = await getSession(legacy.id);
    expect(res.body.exercises).toHaveLength(3);
    expect(await prisma.workoutSessionExercise.count({ where: { sessionId: legacy.id } })).toBe(3);
    await prisma.workoutSession.update({ where: { id: legacy.id }, data: { status: "abandoned" } });
  });

  it("adds an exercise at the end; refuses duplicates, unknown and draft exercises, and finished sessions", async () => {
    const sid = await start();
    const add = await request(app).post(`/workout-sessions/${sid}/exercises`).set("Authorization", auth).send({ exerciseId: ex[3] });
    expect(add.status).toBe(201);
    expect(add.body.exercises.at(-1)).toMatchObject({ exerciseId: ex[3], source: "added", workoutExerciseId: null, order: 3, targetSets: 3 });

    const dup = await request(app).post(`/workout-sessions/${sid}/exercises`).set("Authorization", auth).send({ exerciseId: ex[3] });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("exercise_already_in_session");
    expect((await request(app).post(`/workout-sessions/${sid}/exercises`).set("Authorization", auth).send({ exerciseId: "nope" })).status).toBe(404);
    expect((await request(app).post(`/workout-sessions/${sid}/exercises`).set("Authorization", auth).send({ exerciseId: ex[4] })).status).toBe(404);

    await request(app).post(`/workout-sessions/${sid}/complete`).set("Authorization", auth);
    expect((await request(app).post(`/workout-sessions/${sid}/exercises`).set("Authorization", auth).send({ exerciseId: ex[4] })).status).toBe(409);
  });

  it("swaps before any set (kept after a restart), refuses once sets are logged", async () => {
    const sid = await start();
    const list = (await getSession(sid)).body.exercises;
    const bench = list[1];
    const swap = await request(app).patch(`/workout-sessions/${sid}/exercises/${bench.id}`).set("Authorization", auth).send({ exerciseId: ex[3] });
    expect(swap.status).toBe(200);
    expect(swap.body.exercises[1]).toMatchObject({ exerciseId: ex[3], source: "swapped", workoutExerciseId: bench.workoutExerciseId });
    expect((await getSession(sid)).body.exercises[1].exerciseId).toBe(ex[3]);

    expect((await logSet(sid, { exerciseId: ex[3], setNumber: 1, weightKg: 20, reps: 10 })).status).toBe(201);
    const late = await request(app).patch(`/workout-sessions/${sid}/exercises/${bench.id}`).set("Authorization", auth).send({ exerciseId: ex[1] });
    expect(late.status).toBe(409);
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("links a superset, moves the partner next to it, and clears a group left with one exercise", async () => {
    const sid = await start();
    const [, bench, row] = (await getSession(sid)).body.exercises;
    await request(app).patch(`/workout-sessions/${sid}/exercises/${bench.id}`).set("Authorization", auth).send({ supersetGroup: "A" });
    const linked = await request(app).patch(`/workout-sessions/${sid}/exercises/${row.id}`).set("Authorization", auth).send({ supersetGroup: "A", order: 2 });
    expect(linked.status).toBe(200);
    expect(linked.body.exercises.filter((e: { supersetGroup: string | null }) => e.supersetGroup === "A")).toHaveLength(2);

    const unlinked = await request(app).patch(`/workout-sessions/${sid}/exercises/${row.id}`).set("Authorization", auth).send({ supersetGroup: null });
    expect(unlinked.body.exercises.every((e: { supersetGroup: string | null }) => e.supersetGroup === null)).toBe(true);

    const moved = await request(app).patch(`/workout-sessions/${sid}/exercises/${row.id}`).set("Authorization", auth).send({ order: 0 });
    expect(moved.body.exercises.map((e: { exerciseId: string }) => e.exerciseId)).toEqual([ex[2], ex[0], ex[1]]);
    expect(moved.body.exercises.map((e: { order: number }) => e.order)).toEqual([0, 1, 2]);

    const badLetter = await request(app).patch(`/workout-sessions/${sid}/exercises/${row.id}`).set("Authorization", auth).send({ supersetGroup: "aa" });
    expect(badLetter.status).toBe(400);
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("removes an untouched exercise and keeps the user on the same exercise; refuses one with sets", async () => {
    const sid = await start();
    const [warm, bench] = (await getSession(sid)).body.exercises;
    await request(app).patch(`/workout-sessions/${sid}/progress`).set("Authorization", auth).send({ currentExerciseIndex: 1 });
    await logSet(sid, { exerciseId: ex[1], setNumber: 1, weightKg: 24, reps: 10 });

    expect((await request(app).delete(`/workout-sessions/${sid}/exercises/${bench.id}`).set("Authorization", auth)).status).toBe(409);
    const removed = await request(app).delete(`/workout-sessions/${sid}/exercises/${warm.id}`).set("Authorization", auth);
    expect(removed.status).toBe(200);
    expect(removed.body.exercises.map((e: { exerciseId: string }) => e.exerciseId)).toEqual([ex[1], ex[2]]);
    const after = await prisma.workoutSession.findUnique({ where: { id: sid } });
    expect(after?.currentExerciseIndex).toBe(0);
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("another user's session is 404 for every list edit", async () => {
    const sid = await start();
    const other = await request(app).post("/auth/signup").send({ email: uniqueEmail("sx-other"), password: "SomePassword1!", fullName: "Other" });
    const otherAuth = `Bearer ${other.body.tokens.accessToken}`;
    const [first] = (await getSession(sid)).body.exercises;
    expect((await request(app).post(`/workout-sessions/${sid}/exercises`).set("Authorization", otherAuth).send({ exerciseId: ex[3] })).status).toBe(404);
    expect((await request(app).patch(`/workout-sessions/${sid}/exercises/${first.id}`).set("Authorization", otherAuth).send({ supersetGroup: "A" })).status).toBe(404);
    expect((await request(app).delete(`/workout-sessions/${sid}/exercises/${first.id}`).set("Authorization", otherAuth)).status).toBe(404);
    await prisma.user.deleteMany({ where: { id: other.body.user.id } });
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("drop and failure are separate set types; a set is at most one type", async () => {
    const sid = await start();
    const f = await logSet(sid, { exerciseId: ex[1], setNumber: 1, weightKg: 24, reps: 8, isFailure: true });
    expect(f.status).toBe(201);
    expect(f.body).toMatchObject({ isFailure: true, isDropSet: false, isWarmup: false });
    expect((await logSet(sid, { exerciseId: ex[1], setNumber: 2, reps: 8, isDropSet: true, isFailure: true })).status).toBe(400);

    const d = await logSet(sid, { exerciseId: ex[1], setNumber: 2, weightKg: 18, reps: 10, isDropSet: true });
    const edit = await request(app).patch(`/workout-sessions/${sid}/sets/${d.body.id}`).set("Authorization", auth).send({ isFailure: true });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ isFailure: true, isDropSet: false, isWarmup: false });
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("per-exercise rest is remembered and resolved in the session; clearing falls back to the default", async () => {
    const put = await request(app).put(`/users/me/exercise-rest/${ex[1]}`).set("Authorization", auth).send({ restSeconds: 120 });
    expect(put.status).toBe(200);
    expect((await request(app).put(`/users/me/exercise-rest/${ex[1]}`).set("Authorization", auth).send({ restSeconds: 5 })).status).toBe(400);
    expect((await request(app).put(`/users/me/exercise-rest/nope`).set("Authorization", auth).send({ restSeconds: 60 })).status).toBe(404);
    const list = await request(app).get("/users/me/exercise-rest").set("Authorization", auth);
    expect(list.body.items).toEqual([expect.objectContaining({ exerciseId: ex[1], restSeconds: 120 })]);

    const sid = await start();
    const rows = (await getSession(sid)).body.exercises;
    expect(rows.find((r: { exerciseId: string }) => r.exerciseId === ex[1]).restSeconds).toBe(120);
    expect(rows.find((r: { exerciseId: string }) => r.exerciseId === ex[2]).restSeconds).toBe(90);

    await request(app).delete(`/users/me/exercise-rest/${ex[1]}`).set("Authorization", auth);
    expect((await getSession(sid)).body.exercises.find((r: { exerciseId: string }) => r.exerciseId === ex[1]).restSeconds).toBe(90);
    await prisma.workoutSession.update({ where: { id: sid }, data: { status: "abandoned" } });
  });

  it("feel can be set only on a completed session, and shows in the summary and history", async () => {
    const sid = await start();
    expect((await request(app).patch(`/workout-sessions/${sid}/feel`).set("Authorization", auth).send({ feel: "hard" })).status).toBe(409);
    await request(app).post(`/workout-sessions/${sid}/complete`).set("Authorization", auth);
    const ok = await request(app).patch(`/workout-sessions/${sid}/feel`).set("Authorization", auth).send({ feel: "about_right" });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: sid, feel: "about_right" });
    expect((await request(app).patch(`/workout-sessions/${sid}/feel`).set("Authorization", auth).send({ feel: "great" })).status).toBe(400);
    expect((await request(app).get(`/workout-sessions/${sid}/summary`).set("Authorization", auth)).body.feel).toBe("about_right");
    const history = await request(app).get("/workout-sessions").set("Authorization", auth);
    expect(history.body.items.find((h: { id: string }) => h.id === sid).feel).toBe("about_right");
  });

  it("warm-ups count toward neither volume nor personal records", async () => {
    const sid = await start();
    await logSet(sid, { exerciseId: ex[3], setNumber: 1, weightKg: 200, reps: 1, isWarmup: true });
    await logSet(sid, { exerciseId: ex[1], setNumber: 1, weightKg: 30, reps: 10, isWarmup: true });
    await logSet(sid, { exerciseId: ex[1], setNumber: 2, weightKg: 26, reps: 8 });
    await request(app).post(`/workout-sessions/${sid}/complete`).set("Authorization", auth);
    const summary = await request(app).get(`/workout-sessions/${sid}/summary`).set("Authorization", auth);
    expect(summary.body.totalSets).toBe(3);
    expect(summary.body.totalVolumeKg).toBe(208);
    const prs = summary.body.newPersonalRecords as Array<{ exerciseId: string; weightKg: number }>;
    expect(prs.find((p) => p.exerciseId === ex[3])).toBeUndefined();
    expect(prs.find((p) => p.exerciseId === ex[1])?.weightKg).toBe(26);
    const history = await request(app).get("/workout-sessions").set("Authorization", auth);
    expect(history.body.items.find((h: { id: string }) => h.id === sid).totalVolumeKg).toBe(208);
  });
});
