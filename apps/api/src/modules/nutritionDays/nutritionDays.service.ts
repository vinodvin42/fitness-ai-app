import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { CalendarQuery, SummaryQuery, UpdateMealLogInput } from "./nutritionDays.schema";

/**
 * Fuel gaps. Day/month boundaries are UTC, matching nutrition.service.ts's
 * startOfToday (no stored user timezone yet).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type MealRow = {
  id: string;
  mealType: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: string;
  loggedAt: Date;
};

async function getOwnedMeal(userId: string, id: string) {
  const meal = await prisma.mealLog.findFirst({ where: { id, userId } });
  if (!meal) throw new ApiHttpError(404, "meal_log_not_found", "Meal log not found");
  return meal;
}

export async function updateMealLog(userId: string, id: string, input: UpdateMealLogInput) {
  await getOwnedMeal(userId, id);
  return prisma.mealLog.update({ where: { id }, data: input });
}

export async function deleteMealLog(userId: string, id: string) {
  await getOwnedMeal(userId, id);
  // FoodEstimate.mealLogId is a plain back-reference; detach it so the delete can't be blocked.
  await prisma.foodEstimate.updateMany({ where: { mealLogId: id, userId }, data: { mealLogId: null } });
  await prisma.mealLog.delete({ where: { id } });
  return { deleted: true, id };
}

export async function getDaySummary(userId: string, query: SummaryQuery) {
  const start = new Date(`${query.date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);
  const rows = (await prisma.mealLog.findMany({
    where: { userId, loggedAt: { gte: start, lt: end } },
    orderBy: { loggedAt: "asc" },
  })) as MealRow[];
  const totals = rows.reduce(
    (t, m) => ({
      calories: t.calories + m.calories,
      proteinG: t.proteinG + m.proteinG,
      carbsG: t.carbsG + m.carbsG,
      fatG: t.fatG + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return {
    date: query.date,
    totals,
    mealCount: rows.length,
    meals: rows.map((m) => ({ ...m, loggedAt: m.loggedAt.toISOString() })),
  };
}

export async function getMonthCalendar(userId: string, query: CalendarQuery) {
  const [y, m] = query.month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const rows = (await prisma.mealLog.findMany({
    where: { userId, loggedAt: { gte: start, lt: end } },
    select: { calories: true, loggedAt: true },
  })) as Array<{ calories: number; loggedAt: Date }>;

  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const days = Array.from({ length: daysInMonth }, (_, i) => ({
    date: new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    calories: 0,
    mealCount: 0,
  }));
  for (const r of rows) {
    const d = days[r.loggedAt.getUTCDate() - 1];
    d.calories += r.calories;
    d.mealCount += 1;
  }
  return { month: query.month, days };
}
