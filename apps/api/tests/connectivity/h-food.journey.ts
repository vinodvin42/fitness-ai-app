/**
 * Scenario H — Core daily use: food logging (API level only).
 * Add → edit → delete, supported quantities, local-day totals, retry,
 * ownership. Current behaviour is recorded as observed.
 *
 * Surface: user-mobile (apps/user-mobile/src/api/nutrition.ts; LogMealScreen,
 * FuelScreen, NutritionCalendarScreen). API: modules/nutrition,
 * modules/nutritionDays.
 *
 * The local-day check uses IST (UTC+05:30) as the user's day, because the
 * product is India-first; the API currently has no user time zone at all.
 * The local-day nutrition and portion model is a pending design decision.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import { CONFIGURATION, bearer, blockOn, describeResponse, loginUser, record, startJourney, type Journey } from "./harness/journey";

const S = "H";
const FILES = ["apps/user-mobile/src/api/nutrition.ts", "apps/api/src/modules/nutrition/nutrition.service.ts", "apps/api/src/modules/nutritionDays/nutritionDays.service.ts"];
let j: Journey;
let owner = "";
let other = "";
let mealId = "";

const base = (check: string) => ({ scenario: S, check, surface: "user-mobile", configuration: CONFIGURATION, files: FILES });
const utcDate = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  j = startJourney();
  owner = await loginUser(j, j.world.dailyOwner.email);
  other = await loginUser(j, j.world.dailyOther.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("H. Food logging", () => {
  it("H1 add a meal; it appears in today's list and the day summary", async () => {
    const add = await request(j.app)
      .post("/meal-logs")
      .set(bearer(owner))
      .send({ mealType: "lunch", name: "TEST-ONLY dal and rice", calories: 450, proteinG: 15, carbsG: 70, fatG: 10 });
    mealId = add.body?.id ?? "";
    const today = await request(j.app).get("/meal-logs/today").set(bearer(owner));
    const listed = (today.body?.items ?? []).some((m: { id: string }) => m.id === mealId);
    const loggedAt = add.body?.loggedAt ? new Date(add.body.loggedAt) : new Date();
    const summary = await request(j.app).get(`/nutrition/summary?date=${utcDate(loggedAt)}`).set(bearer(owner));
    const dbRows = await prisma.mealLog.findMany({ where: { userId: j.world.dailyOwner.id, loggedAt: { gte: new Date(`${utcDate(loggedAt)}T00:00:00Z`), lt: new Date(new Date(`${utcDate(loggedAt)}T00:00:00Z`).getTime() + 86_400_000) } } });
    const expectedCalories = dbRows.reduce((n, r) => n + r.calories, 0);
    const ok = add.status === 201 && listed && summary.status === 200 && summary.body?.totals?.calories === expectedCalories;
    record({
      ...base("H1 add → today list → day summary"),
      endpoints: ["POST /meal-logs", "GET /meal-logs/today", "GET /nutrition/summary?date="],
      recordsWritten: [`MealLog ${mealId}`],
      recordsRead: ["MealLog rows for that UTC day (DB)", "today list", "day summary"],
      expected: `201; listed today; summary calories = ${expectedCalories} (sum of stored rows)`,
      observed: `${describeResponse(add)}; listed=${listed}; summary ${describeResponse(summary)} calories=${summary.body?.totals?.calories} mealCount=${summary.body?.mealCount}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("H2 edit then delete the meal", async () => {
    if (!mealId) blockOn({ ...base("H2 edit and delete"), endpoints: [], recordsWritten: [], recordsRead: [], expected: "a meal from H1" }, "H1 created no meal");
    const edit = await request(j.app).patch(`/meal-logs/${mealId}`).set(bearer(owner)).send({ calories: 500, name: "TEST-ONLY dal, rice and curd" });
    const afterEdit = await prisma.mealLog.findUnique({ where: { id: mealId } });
    const del = await request(j.app).delete(`/meal-logs/${mealId}`).set(bearer(owner));
    const afterDelete = await prisma.mealLog.findUnique({ where: { id: mealId } });
    const ok = edit.status === 200 && afterEdit?.calories === 500 && del.status === 200 && !afterDelete;
    record({
      ...base("H2 edit → delete"),
      endpoints: ["PATCH /meal-logs/:id", "DELETE /meal-logs/:id"],
      recordsWritten: [`MealLog ${mealId} (edited, then deleted)`],
      recordsRead: [`MealLog ${mealId}`],
      expected: "edit 200 and stored as 500 kcal; delete 200 and row gone",
      observed: `edit ${describeResponse(edit)} stored=${afterEdit?.calories}; delete ${describeResponse(del)}; row still present=${!!afterDelete}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("H3 supported quantities and value limits", async () => {
    const withQuantity = await request(j.app)
      .post("/meal-logs")
      .set(bearer(owner))
      .send({ mealType: "dinner", name: "TEST-ONLY roti", calories: 240, quantity: 2, unit: "piece" });
    const stored = withQuantity.body?.id ? await prisma.mealLog.findUnique({ where: { id: withQuantity.body.id } }) : null;
    const tooHigh = await request(j.app).post("/meal-logs").set(bearer(owner)).send({ mealType: "snack", name: "TEST-ONLY", calories: 10001 });
    const negative = await request(j.app).post("/meal-logs").set(bearer(owner)).send({ mealType: "snack", name: "TEST-ONLY", calories: -1 });
    record({
      ...base("H3 quantity / serving units"),
      endpoints: ["POST /meal-logs"],
      recordsWritten: withQuantity.status === 201 ? [`MealLog ${withQuantity.body?.id}`] : [],
      recordsRead: ["stored MealLog"],
      expected: "Not defined yet (portion model pending): e.g. 2 pieces of roti stored with quantity and unit",
      observed: `${describeResponse(withQuantity)}; stored fields: calories=${stored?.calories}; quantity/unit kept=${stored ? "quantity" in stored || "unit" in stored : "n/a"} (unknown fields are silently dropped)`,
      verdict: "current-behaviour",
      blockedBy: "Portion/serving model decision (grams, pieces, katori, servings)",
      notes: "MealLog stores only absolute calories and macros; the server computes nothing from a quantity.",
    });
    const ok = tooHigh.status === 400 && negative.status === 400;
    record({
      ...base("H3 value limits"),
      endpoints: ["POST /meal-logs"],
      recordsWritten: [],
      recordsRead: [],
      expected: "calories 10001 → 400; calories -1 → 400",
      observed: `10001 → ${describeResponse(tooHigh)}; -1 → ${describeResponse(negative)}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("H4 local-day totals (user in IST)", async () => {
    // 2026-10-15T20:00Z is 16 Oct 01:30 in IST: the user ate this on their 16th.
    const lateNight = await prisma.mealLog.create({
      data: { userId: j.world.dailyOwner.id, mealType: "snack", name: "TEST-ONLY late-night snack", calories: 123, loggedAt: new Date("2026-10-15T20:00:00Z") },
    });
    const local16 = await request(j.app).get("/nutrition/summary?date=2026-10-16").set(bearer(owner));
    const local15 = await request(j.app).get("/nutrition/summary?date=2026-10-15").set(bearer(owner));
    const in16 = (local16.body?.meals ?? []).some((m: { id: string }) => m.id === lateNight.id);
    const in15 = (local15.body?.meals ?? []).some((m: { id: string }) => m.id === lateNight.id);
    record({
      ...base("H4 meal at 01:30 IST counted on the user's local day"),
      endpoints: ["GET /nutrition/summary?date=2026-10-16", "GET /nutrition/summary?date=2026-10-15"],
      recordsWritten: [`MealLog ${lateNight.id} (loggedAt set directly: 2026-10-15T20:00Z)`],
      recordsRead: ["day summaries for 15 and 16 Oct"],
      expected: "the meal appears in the 16 Oct (local) summary, not 15 Oct",
      observed: `16 Oct ${describeResponse(local16)} contains it=${in16}; 15 Oct contains it=${in15}`,
      verdict: in16 && !in15 ? "passed" : "failed",
      notes: "The server buckets days in UTC and has no user time zone. Between 00:00 and 05:30 IST, food is counted on the previous day. The fix depends on the pending local-day design.",
    });
    expect(in16 && !in15).toBe(true);
  });

  it("H5 retry of the same meal save", async () => {
    const body = { mealType: "breakfast", name: `TEST-ONLY poha ${j.world.runId}`, calories: 300 };
    const first = await request(j.app).post("/meal-logs").set(bearer(owner)).send(body);
    const retry = await request(j.app).post("/meal-logs").set(bearer(owner)).send(body);
    const rows = await prisma.mealLog.count({ where: { userId: j.world.dailyOwner.id, name: body.name } });
    record({
      ...base("H5 lost-response retry"),
      endpoints: ["POST /meal-logs ×2 (identical body)"],
      recordsWritten: [`MealLog ${first.body?.id}`, retry.status === 201 ? `MealLog ${retry.body?.id}` : ""].filter(Boolean),
      recordsRead: ["MealLog count with that name"],
      expected: "a retried save leaves exactly one row",
      observed: `${describeResponse(first)}, retry ${describeResponse(retry)}; rows=${rows}`,
      verdict: rows === 1 ? "passed" : "failed",
      notes: "The API has no idempotency key; the app only de-duplicates on screen (10-minute window), which does not cover a lost response.",
    });
    expect(rows).toBe(1);
  });

  it("H6 another user cannot edit, delete or see the owner's meals", async () => {
    const meal = await request(j.app).post("/meal-logs").set(bearer(owner)).send({ mealType: "snack", name: "TEST-ONLY chana", calories: 150 });
    const id = meal.body?.id as string;
    if (meal.status !== 201 || !id) blockOn({ ...base("H6 ownership"), endpoints: ["POST /meal-logs"], recordsWritten: [], recordsRead: [], expected: "owner meal created" }, `owner meal not created (${describeResponse(meal)})`);
    const edit = await request(j.app).patch(`/meal-logs/${id}`).set(bearer(other)).send({ calories: 1 });
    const del = await request(j.app).delete(`/meal-logs/${id}`).set(bearer(other));
    const otherToday = await request(j.app).get("/meal-logs/today").set(bearer(other));
    const leaked = (otherToday.body?.items ?? []).some((m: { id: string }) => m.id === id);
    const row = await prisma.mealLog.findUnique({ where: { id } });
    const ok = edit.status === 404 && del.status === 404 && !leaked && row?.calories === 150;
    record({
      ...base("H6 ownership"),
      endpoints: ["PATCH /meal-logs/:id", "DELETE /meal-logs/:id", "GET /meal-logs/today"],
      recordsWritten: [`MealLog ${id} (owner)`],
      recordsRead: [`MealLog ${id}`],
      isolation: "Second user editing, deleting and listing the owner's meal",
      expected: "edit 404, delete 404, not in the other user's list, row unchanged",
      observed: `edit ${describeResponse(edit)}; delete ${describeResponse(del)}; leaked=${leaked}; calories still ${row?.calories}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });
});
