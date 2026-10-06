import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { CreateSavedMealInput } from "./savedMeals.schema";

const MAX_SAVED_MEALS = 50;

export function listSavedMeals(userId: string) {
  return prisma.savedMeal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/** Idempotent on (user, name, macros): saving the exact same meal twice returns the existing row. */
export async function createSavedMeal(userId: string, input: CreateSavedMealInput) {
  const existing = await prisma.savedMeal.findFirst({
    where: {
      userId,
      name: input.name,
      calories: input.calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
    },
  });
  if (existing) return existing;

  const count = await prisma.savedMeal.count({ where: { userId } });
  if (count >= MAX_SAVED_MEALS) {
    throw new ApiHttpError(409, "saved_meals_limit", `You can keep up to ${MAX_SAVED_MEALS} saved meals — remove one first`);
  }
  return prisma.savedMeal.create({
    data: {
      userId,
      name: input.name,
      calories: input.calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      items: input.items ? (input.items as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function deleteSavedMeal(userId: string, id: string) {
  const row = await prisma.savedMeal.findFirst({ where: { id, userId }, select: { id: true } });
  if (!row) throw new ApiHttpError(404, "saved_meal_not_found", "Saved meal not found");
  await prisma.savedMeal.delete({ where: { id } });
  return { id, deleted: true as const };
}

/**
 * "Recent Foods" (Fuel 02): the user's most recently logged DISTINCT foods,
 * derived from existing MealLog rows (no new table). Distinct by lower-cased
 * name; each entry carries the macros from its latest log.
 */
export async function listRecentFoods(userId: string, limit: number) {
  const logs = await prisma.mealLog.findMany({
    where: { userId },
    orderBy: { loggedAt: "desc" },
    take: 200,
    select: { name: true, calories: true, proteinG: true, carbsG: true, fatG: true, mealType: true, loggedAt: true },
  });
  const seen = new Set<string>();
  const out: typeof logs = [];
  for (const l of logs) {
    const key = l.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}
