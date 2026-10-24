import type {
  AddSessionExerciseInput,
  DeleteResult,
  ExerciseSetLog,
  LogSetInput,
  SessionExercisesResponse,
  SessionFeel,
  UpdateSessionExerciseInput,
  UpdateSetInput,
  WorkoutCompletionSummary,
  WorkoutHistoryEntry,
  WorkoutSession,
} from "@fitness-ai-app/types";
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

/** Offline set logging (24 Oct 2026): a time limit, after which lib/offlineSets.ts keeps the change on the phone. */
export interface RequestOptions {
  timeout?: number;
}

export function logWorkoutSet(sessionId: string, input: LogSetInput, options?: RequestOptions) {
  return apiClient.post(`/workout-sessions/${sessionId}/sets`, input, options).then((r) => r.data);
}

/** U3 (15 Sep 2026) — persists which exercise the user is on, so a resumed session (Today's "Resume session") lands back where they left off instead of restarting at exercise 1. */
export function updateSessionProgress(sessionId: string, currentExerciseIndex: number, options?: RequestOptions) {
  return apiClient
    .patch<WorkoutSession>(`/workout-sessions/${sessionId}/progress`, { currentExerciseIndex }, options)
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

/** Wave B - edit one logged set (send only what changed; null clears weight/rpe/note). */
export function updateWorkoutSet(sessionId: string, setId: string, input: UpdateSetInput, options?: RequestOptions) {
  return apiClient.patch<ExerciseSetLog>(`/workout-sessions/${sessionId}/sets/${setId}`, input, options).then((r) => r.data);
}

export function deleteWorkoutSet(sessionId: string, setId: string, options?: RequestOptions) {
  return apiClient.delete<DeleteResult>(`/workout-sessions/${sessionId}/sets/${setId}`, options).then((r) => r.data);
}

// ---- Batch 3b (18 Oct 2026): the session's own exercise list and "How did it feel?" ----

/** "+ Add exercise" — appended to the session's list. */
export function addSessionExercise(sessionId: string, input: AddSessionExerciseInput) {
  return apiClient.post<SessionExercisesResponse>(`/workout-sessions/${sessionId}/exercises`, input).then((r) => r.data.exercises);
}

/** Swap (before any set), superset letter, targets or position. */
export function updateSessionExercise(sessionId: string, sessionExerciseId: string, input: UpdateSessionExerciseInput) {
  return apiClient
    .patch<SessionExercisesResponse>(`/workout-sessions/${sessionId}/exercises/${sessionExerciseId}`, input)
    .then((r) => r.data.exercises);
}

/** Only before any of that exercise's sets are logged (409 exercise_has_sets otherwise). */
export function removeSessionExercise(sessionId: string, sessionExerciseId: string) {
  return apiClient.delete<SessionExercisesResponse>(`/workout-sessions/${sessionId}/exercises/${sessionExerciseId}`).then((r) => r.data.exercises);
}

/** Completed sessions only; null clears it. */
export function setSessionFeel(sessionId: string, feel: SessionFeel | null) {
  return apiClient.patch<{ id: string; feel: SessionFeel | null }>(`/workout-sessions/${sessionId}/feel`, { feel }).then((r) => r.data);
}
