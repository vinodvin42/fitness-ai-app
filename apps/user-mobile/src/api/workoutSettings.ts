import { useQuery } from "@tanstack/react-query";
import type { UpdateWorkoutSettingsInput, WorkoutSettings, WorkoutWeightUnit } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export const WORKOUT_SETTINGS_KEY = ["workoutSettings"] as const;

export function fetchWorkoutSettings() {
  return apiClient.get<WorkoutSettings>("/users/me/workout-settings").then((r) => r.data);
}

export function updateWorkoutSettings(input: UpdateWorkoutSettingsInput) {
  return apiClient.patch<WorkoutSettings>("/users/me/workout-settings", input).then((r) => r.data);
}

/** Shared read of the user's workout settings; consumers fall back to defaults while loading/failed. */
export function useWorkoutSettings() {
  return useQuery({ queryKey: WORKOUT_SETTINGS_KEY, queryFn: fetchWorkoutSettings, staleTime: 5 * 60 * 1000 });
}

const KG_PER_LB = 0.45359237;

/** kg (storage unit) -> display value in the user's unit, rounded to 1 decimal. */
export function kgToDisplay(kg: number, unit: WorkoutWeightUnit): number {
  const v = unit === "lb" ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

/** User-entered weight in their unit -> kg for the API. */
export function displayToKg(value: number, unit: WorkoutWeightUnit): number {
  const kg = unit === "lb" ? value * KG_PER_LB : value;
  return Math.round(kg * 100) / 100;
}
