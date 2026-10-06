import type {
  BarcodeLookupResult,
  ConfirmFoodEstimateInput,
  CreateSavedMealInput,
  CreateFoodEstimateInput,
  DeleteResult,
  FoodEstimate,
  LogMealInput,
  LogWaterInput,
  MealLog,
  NutritionCalendarMonth,
  NutritionDaySummary,
  RecentFood,
  SavedMeal,
  UpdateMealLogInput,
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

/**
 * Barcode scan lookup (R2 Wave, 22 Sep 2026) — a real proxy call to the
 * backend's GET /nutrition/barcode/:code, which itself proxies to Open
 * Food Facts (see apps/api's lib/openFoodFactsClient.ts). The mobile app
 * never calls Open Food Facts directly. Resolves normally (never throws)
 * for an honest "not found" — only a real transport/HTTP failure rejects.
 */
export function lookupBarcode(code: string) {
  return apiClient.get<BarcodeLookupResult>(`/nutrition/barcode/${encodeURIComponent(code)}`).then((r) => r.data);
}

/** Wave B - edit a logged meal (send only what changed). */
export function updateMealLog(id: string, input: UpdateMealLogInput) {
  return apiClient.patch<MealLog>(`/meal-logs/${id}`, input).then((r) => r.data);
}

export function deleteMealLog(id: string) {
  return apiClient.delete<DeleteResult>(`/meal-logs/${id}`).then((r) => r.data);
}

/** Totals + meals for one UTC day (YYYY-MM-DD). */
export function fetchNutritionSummary(date: string) {
  return apiClient.get<NutritionDaySummary>("/nutrition/summary", { params: { date } }).then((r) => r.data);
}

/** Per-day calories/meal counts for a month (YYYY-MM). */
export function fetchNutritionCalendar(month: string) {
  return apiClient.get<NutritionCalendarMonth>("/nutrition/calendar", { params: { month } }).then((r) => r.data);
}

/** Fuel 02 "My Saved Meals" — the user's own reusable meals. */
export function fetchSavedMeals() {
  return apiClient.get<{ items: SavedMeal[] }>("/saved-meals").then((r) => r.data.items);
}

export function createSavedMeal(input: CreateSavedMealInput) {
  return apiClient.post<SavedMeal>("/saved-meals", input).then((r) => r.data);
}

export function deleteSavedMeal(id: string) {
  return apiClient.delete<DeleteResult>(`/saved-meals/${id}`).then((r) => r.data);
}

/** Fuel 02 "Recent Foods" — distinct foods from the user's own recent meal logs. */
export function fetchRecentFoods(limit = 6) {
  return apiClient.get<{ items: RecentFood[] }>("/meal-logs/recent-foods", { params: { limit } }).then((r) => r.data.items);
}
