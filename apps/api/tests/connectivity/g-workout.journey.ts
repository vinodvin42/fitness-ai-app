/**
 * Scenario G — Core daily use: workout session (API level only).
 * Start → save set → retry the same save → edit → complete → history,
 * ownership, and invalid session-state transitions. Current behaviour is
 * recorded as observed; nothing in the app was changed for these checks.
 *
 * Surface: user-mobile (apps/user-mobile/src/api/workoutSessions.ts;
 * ActiveWorkoutScreen.tsx computes setNumber and has no retry id).
 * API: modules/workoutSessions, modules/workoutSets.
 * Not covered here: the phone's offline/retry/recovery behaviour and UI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import { CONFIGURATION, bearer, blockOn, describeResponse, loginUser, record, startJourney, type Journey } from "./harness/journey";

const S = "G";
const FILES = ["apps/user-mobile/src/api/workoutSessions.ts", "apps/api/src/modules/workoutSessions/workoutSessions.service.ts", "apps/api/src/modules/workoutSets/workoutSets.service.ts"];
let j: Journey;
let owner = "";
let other = "";
let sessionId = "";
let setId = "";

const base = (check: string) => ({ scenario: S, check, surface: "user-mobile", configuration: CONFIGURATION, files: FILES });
const needSession = (check: string) => {
  if (!sessionId) blockOn({ ...base(check), endpoints: [], recordsWritten: [], recordsRead: [], expected: "an in-progress session from G1" }, "G1 did not start a session");
};

beforeAll(async () => {
  j = startJourney();
  owner = await loginUser(j, j.world.dailyOwner.email);
  other = await loginUser(j, j.world.dailyOther.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("G. Workout session", () => {
  it("G1 start a session; it appears in history as in progress", async () => {
    const start = await request(j.app).post(`/workouts/${j.world.training.workoutId}/sessions`).set(bearer(owner));
    sessionId = start.body?.id ?? "";
    const history = await request(j.app).get("/workout-sessions").set(bearer(owner));
    const item = (history.body?.items ?? []).find((s: { id: string }) => s.id === sessionId);
    const ok = start.status === 201 && start.body?.status === "in_progress" && item?.status === "in_progress";
    record({
      ...base("G1 start → history"),
      endpoints: ["POST /workouts/:workoutId/sessions", "GET /workout-sessions"],
      recordsWritten: [`WorkoutSession ${sessionId}`],
      recordsRead: ["WorkoutSession list for the owner"],
      expected: "201 in_progress; listed in history as in_progress",
      observed: `start ${describeResponse(start)} status=${start.body?.status}; history status=${item?.status ?? "(not listed)"}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("G2 save a set, then retry the identical save (lost-response retry)", async () => {
    needSession("G2 set save and retry");
    const body = { exerciseId: j.world.training.exerciseId, setNumber: 1, weightKg: 20, reps: 10 };
    const first = await request(j.app).post(`/workout-sessions/${sessionId}/sets`).set(bearer(owner)).send(body);
    setId = first.body?.id ?? "";
    const retry = await request(j.app).post(`/workout-sessions/${sessionId}/sets`).set(bearer(owner)).send(body);
    const rows = await prisma.exerciseSetLog.count({ where: { sessionId, setNumber: 1 } });
    record({
      ...base("G2 set save"),
      endpoints: ["POST /workout-sessions/:id/sets"],
      recordsWritten: [`ExerciseSetLog ${setId}`],
      recordsRead: ["ExerciseSetLog for the session"],
      expected: "201 with the saved set",
      observed: `${describeResponse(first)} weightKg=${first.body?.weightKg} reps=${first.body?.reps}`,
      verdict: first.status === 201 ? "passed" : "failed",
    });
    record({
      ...base("G2 retry of the same set"),
      endpoints: ["POST /workout-sessions/:id/sets (identical body again)"],
      recordsWritten: retry.status === 201 ? [`ExerciseSetLog ${retry.body?.id} (second row)`] : [],
      recordsRead: ["ExerciseSetLog count for setNumber 1"],
      expected: "a retried save of the same set leaves exactly one row",
      observed: `retry ${describeResponse(retry)}; rows for set 1 = ${rows}`,
      verdict: rows === 1 ? "passed" : "failed",
      notes: "The API has no client id / idempotency key and no unique (session, set) constraint, so it cannot tell a retry from a new set.",
    });
    expect(first.status).toBe(201);
    expect(rows).toBe(1);
  });

  it("G3 edit a saved set; the session detail shows the edit", async () => {
    needSession("G3 edit set");
    if (!setId) blockOn({ ...base("G3 edit set"), endpoints: [], recordsWritten: [], recordsRead: [], expected: "a saved set from G2" }, "G2 saved no set");
    const edit = await request(j.app).patch(`/workout-sessions/${sessionId}/sets/${setId}`).set(bearer(owner)).send({ weightKg: 22.5, reps: 8 });
    const detail = await request(j.app).get(`/workout-sessions/${sessionId}`).set(bearer(owner));
    const row = (detail.body?.setLogs ?? []).find((s: { id: string }) => s.id === setId);
    const ok = edit.status === 200 && row?.weightKg === 22.5 && row?.reps === 8;
    record({
      ...base("G3 edit set → detail"),
      endpoints: ["PATCH /workout-sessions/:id/sets/:setId", "GET /workout-sessions/:id"],
      recordsWritten: [`ExerciseSetLog ${setId}`],
      recordsRead: [`WorkoutSession ${sessionId} with set logs`],
      expected: "200; detail shows 22.5 kg × 8",
      observed: `${describeResponse(edit)}; detail shows ${row?.weightKg} kg × ${row?.reps}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("G4 complete; history totals match the saved sets", async () => {
    needSession("G4 complete → history");
    const complete = await request(j.app).post(`/workout-sessions/${sessionId}/complete`).set(bearer(owner));
    const sets = await prisma.exerciseSetLog.findMany({ where: { sessionId } });
    const expectedVolume = sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0);
    const history = await request(j.app).get("/workout-sessions").set(bearer(owner));
    const item = (history.body?.items ?? []).find((s: { id: string }) => s.id === sessionId);
    const ok =
      complete.status === 200 &&
      complete.body?.status === "completed" &&
      item?.status === "completed" &&
      item?.totalSets === sets.length &&
      Math.abs((item?.totalVolumeKg ?? -1) - expectedVolume) < 0.001;
    record({
      ...base("G4 complete → history totals"),
      endpoints: ["POST /workout-sessions/:id/complete", "GET /workout-sessions"],
      recordsWritten: [`WorkoutSession ${sessionId} (completed)`],
      recordsRead: ["ExerciseSetLog rows (DB)", "history item"],
      expected: `completed; history totalSets=${sets.length} and totalVolumeKg=${expectedVolume} (computed from the saved rows)`,
      observed: `${describeResponse(complete)} status=${complete.body?.status}; history status=${item?.status} totalSets=${item?.totalSets} totalVolumeKg=${item?.totalVolumeKg}`,
      verdict: ok ? "passed" : "failed",
      notes: "Totals are compared with the rows actually stored, which include any duplicate from G2.",
    });
    expect(ok).toBe(true);
  });

  it("G5 invalid state transitions after completion", async () => {
    needSession("G5 transitions");
    const logAfter = await request(j.app)
      .post(`/workout-sessions/${sessionId}/sets`)
      .set(bearer(owner))
      .send({ exerciseId: j.world.training.exerciseId, setNumber: 9, weightKg: 10, reps: 5 });
    const before = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
    const completeAgain = await request(j.app).post(`/workout-sessions/${sessionId}/complete`).set(bearer(owner));
    const after = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
    const abandonAfter = await request(j.app).post(`/workout-sessions/${sessionId}/abandon`).set(bearer(owner));
    const editAfter = setId
      ? await request(j.app).patch(`/workout-sessions/${sessionId}/sets/${setId}`).set(bearer(owner)).send({ reps: 7 })
      : null;
    const endpoints = ["POST /workout-sessions/:id/sets", "POST /workout-sessions/:id/complete", "POST /workout-sessions/:id/abandon", "PATCH /workout-sessions/:id/sets/:setId"];
    record({
      ...base("G5 save a set into a completed session"),
      endpoints: [endpoints[0]],
      recordsWritten: [],
      recordsRead: [],
      expected: "409 session_not_active",
      observed: describeResponse(logAfter),
      verdict: logAfter.status === 409 ? "passed" : "failed",
    });
    const completedAtChanged = before?.completedAt?.getTime() !== after?.completedAt?.getTime();
    record({
      ...base("G5 complete an already completed session"),
      endpoints: [endpoints[1]],
      recordsWritten: completedAtChanged ? ["WorkoutSession.completedAt overwritten"] : [],
      recordsRead: [`WorkoutSession ${sessionId}`],
      expected: "refused (409); completion time unchanged",
      observed: `${describeResponse(completeAgain)}; completedAt changed=${completedAtChanged}`,
      verdict: completeAgain.status === 409 && !completedAtChanged ? "passed" : "failed",
      notes: "Completing again moves completedAt and so changes the session's recorded duration.",
    });
    record({
      ...base("G5 abandon a completed session"),
      endpoints: [endpoints[2]],
      recordsWritten: [],
      recordsRead: [],
      expected: "409 session_not_active",
      observed: describeResponse(abandonAfter),
      verdict: abandonAfter.status === 409 ? "passed" : "failed",
    });
    if (editAfter) {
      record({
        ...base("G5 edit a set of a completed session"),
        endpoints: [endpoints[3]],
        recordsWritten: editAfter.status === 200 ? [`ExerciseSetLog ${setId}`] : [],
        recordsRead: [],
        expected: "Not defined: post-workout corrections may be intended",
        observed: describeResponse(editAfter),
        verdict: "current-behaviour",
        blockedBy: "Decision: may a completed workout's sets be edited, and for how long?",
      });
    }
    expect(logAfter.status).toBe(409);
    expect(completeAgain.status).toBe(409);
  });

  it("G6 abandoned session cannot be completed; parallel sessions", async () => {
    const s2 = await request(j.app).post(`/workouts/${j.world.training.workoutId}/sessions`).set(bearer(owner));
    const s3 = await request(j.app).post(`/workouts/${j.world.training.workoutId}/sessions`).set(bearer(owner));
    const inProgress = await prisma.workoutSession.count({ where: { userId: j.world.dailyOwner.id, status: "in_progress" } });
    record({
      ...base("G6 start a second session while one is in progress"),
      endpoints: ["POST /workouts/:workoutId/sessions ×2"],
      recordsWritten: [`WorkoutSession ${s2.body?.id}`, `WorkoutSession ${s3.body?.id}`],
      recordsRead: ["in-progress session count for the owner"],
      expected: "Not defined: one active session at a time, or several",
      observed: `${describeResponse(s2)}, ${describeResponse(s3)}; in-progress sessions now ${inProgress}`,
      verdict: "current-behaviour",
      blockedBy: "Decision: allow more than one in-progress session per user?",
    });
    const abandon = await request(j.app).post(`/workout-sessions/${s3.body?.id}/abandon`).set(bearer(owner));
    const completeAbandoned = await request(j.app).post(`/workout-sessions/${s3.body?.id}/complete`).set(bearer(owner));
    const row = await prisma.workoutSession.findUnique({ where: { id: s3.body?.id ?? "" } });
    const ok = abandon.status === 200 && completeAbandoned.status === 409 && row?.status === "abandoned";
    record({
      ...base("G6 complete an abandoned session"),
      endpoints: ["POST /workout-sessions/:id/abandon", "POST /workout-sessions/:id/complete"],
      recordsWritten: [`WorkoutSession ${s3.body?.id}`],
      recordsRead: [`WorkoutSession ${s3.body?.id}`],
      expected: "abandon 200; completing it afterwards refused (409); stays abandoned",
      observed: `abandon ${describeResponse(abandon)}; complete ${describeResponse(completeAbandoned)}; status now ${row?.status}`,
      verdict: ok ? "passed" : "failed",
    });
    // leave s2 abandoned so it does not linger as a second in-progress session
    if (s2.body?.id) await request(j.app).post(`/workout-sessions/${s2.body.id}/abandon`).set(bearer(owner));
    expect(ok).toBe(true);
  });

  it("G7 another user cannot read or change the owner's session", async () => {
    needSession("G7 ownership");
    const read = await request(j.app).get(`/workout-sessions/${sessionId}`).set(bearer(other));
    const log = await request(j.app)
      .post(`/workout-sessions/${sessionId}/sets`)
      .set(bearer(other))
      .send({ exerciseId: j.world.training.exerciseId, setNumber: 1, weightKg: 5, reps: 5 });
    const edit = setId ? await request(j.app).patch(`/workout-sessions/${sessionId}/sets/${setId}`).set(bearer(other)).send({ reps: 1 }) : null;
    const del = setId ? await request(j.app).delete(`/workout-sessions/${sessionId}/sets/${setId}`).set(bearer(other)) : null;
    const list = await request(j.app).get("/workout-sessions").set(bearer(other));
    const leaked = (list.body?.items ?? []).some((s: { id: string }) => s.id === sessionId);
    const ok = read.status === 404 && log.status === 404 && (!edit || edit.status === 404) && (!del || del.status === 404) && !leaked;
    record({
      ...base("G7 ownership"),
      endpoints: ["GET /workout-sessions/:id", "POST /workout-sessions/:id/sets", "PATCH/DELETE /workout-sessions/:id/sets/:setId", "GET /workout-sessions"],
      recordsWritten: [],
      recordsRead: [`WorkoutSession ${sessionId}`],
      isolation: "Second user reading, adding to, editing and deleting the owner's session and sets",
      expected: "every attempt 404; not in the other user's history",
      observed: `read ${describeResponse(read)}; add set ${describeResponse(log)}; edit ${edit ? describeResponse(edit) : "skipped"}; delete ${del ? describeResponse(del) : "skipped"}; in other's history=${leaked}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("G8 input validation on set save", async () => {
    const s = await request(j.app).post(`/workouts/${j.world.training.workoutId}/sessions`).set(bearer(owner));
    const zero = await request(j.app).post(`/workout-sessions/${s.body?.id}/sets`).set(bearer(owner)).send({ exerciseId: j.world.training.exerciseId, setNumber: 1, weightKg: 0, reps: 5 });
    const unknown = await request(j.app).post(`/workout-sessions/${s.body?.id}/sets`).set(bearer(owner)).send({ exerciseId: "tst-no-such-exercise", setNumber: 1, weightKg: 10, reps: 5 });
    await request(j.app).post(`/workout-sessions/${s.body?.id}/abandon`).set(bearer(owner));
    record({
      ...base("G8 weight 0"),
      endpoints: ["POST /workout-sessions/:id/sets"],
      recordsWritten: [],
      recordsRead: [],
      expected: "400 validation_error",
      observed: describeResponse(zero),
      verdict: zero.status === 400 ? "passed" : "failed",
    });
    record({
      ...base("G8 unknown exercise id"),
      endpoints: ["POST /workout-sessions/:id/sets"],
      recordsWritten: [],
      recordsRead: [],
      expected: "a 4xx client error (e.g. 404 exercise_not_found)",
      observed: describeResponse(unknown),
      verdict: unknown.status >= 400 && unknown.status < 500 ? "passed" : "failed",
      notes: "A 500 here means the database foreign key rejected it after validation passed.",
    });
    expect(zero.status).toBe(400);
    expect(unknown.status).toBeLessThan(500);
  });
});
