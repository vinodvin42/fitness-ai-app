import type { Exercise, ExerciseDetail, Program, ProgramDetail, Recipe, WorkoutDetail } from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Phase 0/1: read-only, backed by the seed data in apps/api/scripts/seed.ts
// until the admin CMS ships in Phase 6 (docs/platform/roadmap.md).

export function fetchPrograms() {
  return apiClient.get<{ items: Program[] }>("/programs").then((r) => r.data.items);
}

export function fetchProgramDetail(programId: string) {
  return apiClient.get<ProgramDetail>(`/programs/${programId}`).then((r) => r.data);
}

export function fetchWorkoutDetail(workoutId: string) {
  return apiClient.get<WorkoutDetail>(`/workouts/${workoutId}`).then((r) => r.data);
}

export function fetchExercises() {
  return apiClient.get<{ items: Exercise[] }>("/exercises").then((r) => r.data.items);
}

export function fetchExerciseDetail(exerciseId: string) {
  return apiClient.get<ExerciseDetail>(`/exercises/${exerciseId}`).then((r) => r.data);
}

export function fetchRecipes() {
  return apiClient.get<{ items: Recipe[] }>("/recipes").then((r) => r.data.items);
}

export function fetchRecipeDetail(recipeId: string) {
  return apiClient.get<Recipe>(`/recipes/${recipeId}`).then((r) => r.data);
}
