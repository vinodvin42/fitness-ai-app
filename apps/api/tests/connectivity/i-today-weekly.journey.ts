/**
 * Scenario I — Core daily use: Today and weekly review vs saved records
 * (API level only).
 *
 * There is no server-side "Today" or "weekly review" aggregate: the user
 * app composes both on the phone (TodayScreen.tsx, ProgressReviewScreen.tsx)
 * from the endpoints below. These checks compare those endpoints with the
 * rows actually stored, and check the sparse (no data) case. How the phone
 * combines them is a UI check and is not covered here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import { CONFIGURATION, bearer, describeResponse, loginUser, record, startJourney, type Journey } from "./harness/journey";

const S = "I";
const FILES = [
  "apps/user-mobile/src/screens/today/TodayScreen.tsx",
  "apps/user-mobile/src/screens/progress/ProgressReviewScreen.tsx",
  "apps/api/src/modules/trainingAnalytics/trainingAnalytics.service.ts",
  "apps/api/src/modules/workoutSessions/workoutSessions.service.ts",
  "apps/api/src/modules/nutritionDays/nutritionDays.service.ts",
  "apps/api/src/modules/progress/progress.service.ts",
];
let j: Journey;
let active = "";
let sparse = "";

const base = (check: string) => ({ scenario: S, check, surface: "user-mobile (Today, weekly review)", configuration: CONFIGURATION, files: FILES });
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  j = startJourney();
  active = await loginUser(j, j.world.reviewActive.email);
  sparse = await loginUser(j, j.world.reviewSparse.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("I. Today / weekly review", () => {
  it("I1 a user with no records gets empty, well-formed answers (no errors)", async () => {
    const calls = {
      sessions: await request(j.app).get("/workout-sessions").set(bearer(sparse)),
      mealsToday: await request(j.app).get("/meal-logs/today").set(bearer(sparse)),
      summary: await request(j.app).get(`/nutrition/summary?date=${today()}`).set(bearer(sparse)),
      analytics: await request(j.app).get("/training/analytics?range=1w").set(bearer(sparse)),
      streaks: await request(j.app).get("/progress/streaks").set(bearer(sparse)),
      overview: await request(j.app).get("/progress/overview").set(bearer(sparse)),
      checkins: await request(j.app).get("/check-ins/status").set(bearer(sparse)),
    };
    const statuses = Object.entries(calls).map(([k, r]) => `${k} ${describeResponse(r)}`).join("; ");
    const allOk = Object.values(calls).every((r) => r.status === 200);
    const emptyOk =
      (calls.sessions.body?.items ?? null)?.length === 0 &&
      (calls.mealsToday.body?.items ?? null)?.length === 0 &&
      calls.summary.body?.totals?.calories === 0 &&
      calls.summary.body?.mealCount === 0 &&
      calls.analytics.body?.totalSessions === 0 &&
      Array.isArray(calls.analytics.body?.weeks) &&
      calls.checkins.body?.daily?.submitted === false;
    record({
      ...base("I1 sparse data"),
      endpoints: ["GET /workout-sessions", "GET /meal-logs/today", "GET /nutrition/summary", "GET /training/analytics?range=1w", "GET /progress/streaks", "GET /progress/overview", "GET /check-ins/status"],
      recordsWritten: [],
      recordsRead: ["all of the above for a user with no records"],
      expected: "all 200; empty lists, zero totals, check-in not submitted",
      observed: `${statuses}; analytics weeks=${calls.analytics.body?.weeks?.length}; overview goal=${calls.overview.body?.goal ?? "null"}`,
      verdict: allOk && emptyOk ? "passed" : "failed",
    });
    expect(allOk && emptyOk).toBe(true);
  });

  it("I2 workout figures agree with the stored sets across history and analytics", async () => {
    const start = await request(j.app).post(`/workouts/${j.world.training.workoutId}/sessions`).set(bearer(active));
    const id = start.body?.id as string;
    const warm = await request(j.app).post(`/workout-sessions/${id}/sets`).set(bearer(active)).send({ exerciseId: j.world.training.exerciseId, setNumber: 1, weightKg: 10, reps: 10, isWarmup: true });
    const work = await request(j.app).post(`/workout-sessions/${id}/sets`).set(bearer(active)).send({ exerciseId: j.world.training.exerciseId, setNumber: 2, weightKg: 30, reps: 5 });
    const done = await request(j.app).post(`/workout-sessions/${id}/complete`).set(bearer(active));
    const stored = await prisma.exerciseSetLog.findMany({ where: { sessionId: id } });
    const allVolume = stored.reduce((n, s) => n + (s.weightKg ?? 0) * s.reps, 0);
    const workingVolume = stored.filter((s) => !s.isWarmup).reduce((n, s) => n + (s.weightKg ?? 0) * s.reps, 0);
    const history = await request(j.app).get("/workout-sessions").set(bearer(active));
    const item = (history.body?.items ?? []).find((s: { id: string }) => s.id === id);
    const analytics = await request(j.app).get("/training/analytics?range=1w").set(bearer(active));
    const streaks = await request(j.app).get("/progress/streaks").set(bearer(active));
    const training = (streaks.body?.categories ?? []).find((c: { category: string }) => c.category === "training");
    const sessionsOk = analytics.body?.totalSessions === 1;
    const historyMatchesRows = item?.totalSets === stored.length && item?.totalVolumeKg === allVolume;
    const analyticsMatchesHistory = analytics.body?.totalSets === item?.totalSets && analytics.body?.totalVolumeKg === item?.totalVolumeKg;
    const streakOk = (training?.activeDates ?? []).includes(today());
    record({
      ...base("I2 workout totals: history vs analytics vs stored rows"),
      endpoints: ["POST /workouts/:id/sessions", "POST /workout-sessions/:id/sets ×2", "POST /workout-sessions/:id/complete", "GET /workout-sessions", "GET /training/analytics?range=1w", "GET /progress/streaks"],
      recordsWritten: [`WorkoutSession ${id}`, "2 ExerciseSetLog rows (one warm-up)"],
      recordsRead: ["stored set rows (DB)", "history", "analytics", "streaks"],
      expected: `history and analytics show the same sets/volume for the same workout; 1 completed session; today's date in the training streak (stored: ${stored.length} sets, ${allVolume} kg incl. warm-up, ${workingVolume} kg excl.)`,
      observed:
        `setup ${describeResponse(start)}/${describeResponse(warm)}/${describeResponse(work)}/${describeResponse(done)}; ` +
        `history sets=${item?.totalSets} volume=${item?.totalVolumeKg}; analytics sessions=${analytics.body?.totalSessions} sets=${analytics.body?.totalSets} volume=${analytics.body?.totalVolumeKg}; streak has today=${streakOk}`,
      verdict: sessionsOk && historyMatchesRows && analyticsMatchesHistory && streakOk ? "passed" : "failed",
      notes: "History/summary count warm-up sets; analytics excludes them. If they disagree, deciding whether warm-ups count is part of the fix.",
    });
    expect(sessionsOk && historyMatchesRows && analyticsMatchesHistory && streakOk).toBe(true);
  });

  it("I3 food figures agree with the stored meals across today, summary and calendar", async () => {
    await request(j.app).post("/meal-logs").set(bearer(active)).send({ mealType: "breakfast", name: "TEST-ONLY idli", calories: 200, proteinG: 6 });
    await request(j.app).post("/meal-logs").set(bearer(active)).send({ mealType: "lunch", name: "TEST-ONLY rajma chawal", calories: 550, proteinG: 18 });
    const dayStart = new Date(`${today()}T00:00:00Z`);
    const rows = await prisma.mealLog.findMany({ where: { userId: j.world.reviewActive.id, loggedAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } } });
    const storedCalories = rows.reduce((n, r) => n + r.calories, 0);
    const list = await request(j.app).get("/meal-logs/today").set(bearer(active));
    const listCalories = (list.body?.items ?? []).reduce((n: number, m: { calories: number }) => n + m.calories, 0);
    const summary = await request(j.app).get(`/nutrition/summary?date=${today()}`).set(bearer(active));
    const calendar = await request(j.app).get(`/nutrition/calendar?month=${today().slice(0, 7)}`).set(bearer(active));
    const dayEntry = (calendar.body?.days ?? []).find((d: { date: string }) => d.date === today());
    const ok = listCalories === storedCalories && summary.body?.totals?.calories === storedCalories && dayEntry?.calories === storedCalories && summary.body?.mealCount === rows.length;
    record({
      ...base("I3 food totals: today list vs day summary vs calendar vs stored rows"),
      endpoints: ["POST /meal-logs ×2", "GET /meal-logs/today", "GET /nutrition/summary", "GET /nutrition/calendar"],
      recordsWritten: ["2 MealLog rows"],
      recordsRead: ["stored meal rows for today (UTC)", "today list", "summary", "calendar"],
      expected: `all three show ${storedCalories} kcal across ${rows.length} meals (sum of stored rows)`,
      observed: `today list=${listCalories}; summary=${summary.body?.totals?.calories} (${summary.body?.mealCount} meals); calendar=${dayEntry?.calories}`,
      verdict: ok ? "passed" : "failed",
      notes: "All three use the UTC day; see H4 for the local-day (IST) gap.",
    });
    expect(ok).toBe(true);
  });
});
