import type { MealPlan } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Meal-Plan Generation Engine client (22 Sep 2026) — apps/api's
 * apps/api/src/modules/mealPlans/mealPlans.routes.ts. Same "synchronous
 * from the caller's point of view" convention as api/plans.ts's
 * generatePlan: the request awaits the real LLM call server-side and
 * resolves with the FINAL status ("generated" or "failed"), never
 * "generating" — that state only exists client-side, as the loading UI
 * while the request is in flight.
 */

export function generateMealPlan() {
  return apiClient.post<MealPlan>("/nutrition/meal-plans/generate").then((r) => r.data);
}

export function fetchCurrentMealPlan() {
  return apiClient.get<{ mealPlan: MealPlan | null }>("/nutrition/meal-plans/current").then((r) => r.data.mealPlan);
}
