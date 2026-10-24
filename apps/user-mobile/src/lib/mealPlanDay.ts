import type { MealPlan, MealPlanItem, MealType } from "@fitness-ai-app/types";

/**
 * Today's planned meals by meal type (Figma fuel/01 "Planned · ~640 kcal").
 * Only when today falls inside the active plan (day 1 = the day it was made);
 * outside it nothing is planned, never a stale Day 1. Pure, so
 * tests/mealPlanDay.check.cjs can run it.
 */
export function plannedMealsToday(plan: MealPlan | null | undefined, now: Date = new Date()): Partial<Record<MealType, MealPlanItem[]>> {
  if (!plan || plan.status !== "generated") return {};
  const c = new Date(plan.createdAt);
  const start = new Date(c.getFullYear(), c.getMonth(), c.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Math.round((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (day < 1 || day > plan.durationDays) return {};
  const out: Partial<Record<MealType, MealPlanItem[]>> = {};
  for (const item of plan.items) {
    if (item.dayNumber !== day) continue;
    (out[item.mealType] ??= []).push(item);
  }
  return out;
}
