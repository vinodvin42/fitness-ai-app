import type { LogSetInput, WorkoutCompletionSummary, WorkoutHistoryEntry, WorkoutSession } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function startWorkoutSession(workoutId: string) {
  return apiClient.post<WorkoutSession>(`/workouts/${workoutId}/sessions`).then((r) => r.data);
}

/** Every session this user has ever started, most recent first — backs Workout History (trn-11). */
export function fetchWorkoutHistory() {
  return apiClient.get<{ items: WorkoutHistoryEntry[] }>("/workout-sessions").then((r) => r.data.items);
}

/** Session detail + its real, server-persisted `setLogs` — backs the Set/Rest Tracker's set-history table. */
export function fetchWorkoutSession(sessionId: string) {
  return apiClient.get<WorkoutSession>(`/workout-sessions/${sessionId}`).then((r) => r.data);
}

export function logWorkoutSet(sessionId: string, input: LogSetInput) {
  return apiClient.post(`/workout-sessions/${sessionId}/sets`, input).then((r) => r.data);
}

/** U3 (15 Sep 2026) — persists which exercise the user is on, so a resumed session (Today's "Resume session") lands back where they left off instead of restarting at exercise 1. */
export function updateSessionProgress(sessionId: string, currentExerciseIndex: number) {
  return apiClient
    .patch<WorkoutSession>(`/workout-sessions/${sessionId}/progress`, { currentExerciseIndex })
    .then((r) => r.data);
}

export function completeWorkoutSession(sessionId: string) {
  return apiClient.post<WorkoutSession>(`/workout-sessions/${sessionId}/complete`).then((r) => r.data);
}

/** Explicit "Abandon Workout" action (gap §33's button half) — marks the session abandoned rather than leaving it stuck "in_progress" forever. */
export function abandonWorkoutSession(sessionId: string) {
  return apiClient.post<WorkoutSession>(`/workout-sessions/${sessionId}/abandon`).then((r) => r.data);
}

/** Real totals, new-PR detection, and the current training streak — backs Workout Complete (trn-10). */
export function fetchSessionSummary(sessionId: string) {
  return apiClient.get<WorkoutCompletionSummary>(`/workout-sessions/${sessionId}/summary`).then((r) => r.data);
}
