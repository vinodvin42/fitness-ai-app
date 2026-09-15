import type {
  ConfirmFoodEstimateInput,
  CreateFoodEstimateInput,
  FoodEstimate,
  LogMealInput,
  LogWaterInput,
  MealLog,
  WaterLog,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchTodayMealLogs() {
  return apiClient.get<{ items: MealLog[] }>("/meal-logs/today").then((r) => r.data.items);
}

/** Every meal this user has ever logged, all-time — backs Nutrition Calendar. */
export function fetchMealHistory() {
  return apiClient.get<{ items: MealLog[] }>("/meal-logs").then((r) => r.data.items);
}

export function logMeal(input: LogMealInput) {
  return apiClient.post<MealLog>("/meal-logs", input).then((r) => r.data);
}

export function fetchTodayWaterLogs() {
  return apiClient.get<{ items: WaterLog[] }>("/water-logs/today").then((r) => r.data.items);
}

export function logWater(input: LogWaterInput = {}) {
  return apiClient.post<WaterLog>("/water-logs", input).then((r) => r.data);
}

/**
 * Food input data-quality flow (U4, 15 Sep 2026) — see apps/api's
 * FoodEstimate model doc comment (schema.prisma) for the full design.
 * Synchronous, same convention as api/plans.ts's generatePlan: this awaits
 * the real AI call server-side and resolves with a FINAL status
 * ("estimated" or "insufficient_context"), never a persisted "estimating".
 */
export function createFoodEstimate(input: CreateFoodEstimateInput) {
  return apiClient.post<FoodEstimate>("/food-estimates", input).then((r) => r.data);
}

/** Confirms (no fields) or edits (any changed field) an estimate into a real, logged MealLog — the BR-DAT-003 gate. */
export function confirmFoodEstimate(estimateId: string, input: ConfirmFoodEstimateInput = {}) {
  return apiClient.post<MealLog>(`/food-estimates/${estimateId}/confirm`, input).then((r) => r.data);
}
