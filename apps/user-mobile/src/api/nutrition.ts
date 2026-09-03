import type { LogMealInput, LogWaterInput, MealLog, WaterLog } from "@fitness-ai-app/types";
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
