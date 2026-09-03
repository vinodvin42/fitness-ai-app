import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { LogMealInput, LogWaterInput } from "./nutrition.schema";

/**
 * The Fuel/Nutrition daily loop (docs/mobile/03-screen-inventory.md §D):
 * fetch today's logged meals for the Nutrition Dashboard's meal timeline,
 * and log a new one either from a Recipe or via manual macro entry. Also
 * (19 Aug 2026) the same daily loop for WaterLog — the dashboard's
 * water-intake tracker. Phase 1 scope only — no edit/delete of a logged
 * meal or water entry (matches how WorkoutSession set logs are append-only
 * in this same pass). Also (19 Aug 2026) `listMealHistory` — every meal
 * logged, all-time — backing the Nutrition Calendar screen.
 */

function startOfToday(): Date {
  // NOTE: UTC day boundary, not the user's local timezone — there's no
  // stored timezone/offset for a user yet. Flagged as a known simplification,
  // same pattern as other Phase 1 gaps (see docs/mobile/07-open-questions-gaps.md).
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getTodayMealLogs(userId: string) {
  return prisma.mealLog.findMany({
    where: { userId, loggedAt: { gte: startOfToday() } },
    orderBy: { loggedAt: "asc" },
  });
}

// Nutrition Calendar (docs/mobile/03-screen-inventory.md §D): every meal
// this user has ever logged, all-time (not just today), so the calendar can
// page through any month. Same "fetch everything, group by day/month
// client-side" pattern as Workout History's listHistory and Timeline Month
// grouping Timeline Overview's events — no new server-side "compliance" or
// per-day-summary concept is introduced here; that's computed in the mobile
// screen itself (see gap §28 for why "compliance" is this pass's own
// interpretation, not a literal design spec).
export function listMealHistory(userId: string) {
  return prisma.mealLog.findMany({
    where: { userId },
    orderBy: { loggedAt: "asc" },
  });
}

export async function logMeal(userId: string, input: LogMealInput) {
  let entry: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    recipeId: string | null;
    source: "recipe" | "manual";
  };

  if (input.recipeId) {
    const recipe = await prisma.recipe.findUnique({ where: { id: input.recipeId } });
    if (!recipe) {
      throw new ApiHttpError(404, "recipe_not_found", "Recipe not found");
    }
    entry = {
      name: recipe.name,
      calories: recipe.calories,
      proteinG: recipe.proteinG,
      carbsG: recipe.carbsG,
      fatG: recipe.fatG,
      recipeId: recipe.id,
      source: "recipe",
    };
  } else {
    // logMealSchema's refine() guarantees name/calories are present here.
    entry = {
      name: input.name!,
      calories: input.calories!,
      proteinG: input.proteinG ?? 0,
      carbsG: input.carbsG ?? 0,
      fatG: input.fatG ?? 0,
      recipeId: null,
      source: "manual",
    };
  }

  const mealLog = await prisma.mealLog.create({
    data: { userId, mealType: input.mealType, ...entry },
  });

  await recordAudit({
    actorId: userId,
    action: "meal_log.created",
    entityType: "MealLog",
    entityId: mealLog.id,
    metadata: { source: entry.source, mealType: input.mealType },
  });

  return mealLog;
}

export function getTodayWaterLogs(userId: string) {
  return prisma.waterLog.findMany({
    where: { userId, loggedAt: { gte: startOfToday() } },
    orderBy: { loggedAt: "asc" },
  });
}

export async function logWater(userId: string, input: LogWaterInput) {
  const waterLog = await prisma.waterLog.create({
    data: { userId, glasses: input.glasses },
  });

  await recordAudit({
    actorId: userId,
    action: "water_log.created",
    entityType: "WaterLog",
    entityId: waterLog.id,
    metadata: { glasses: input.glasses },
  });

  return waterLog;
}
