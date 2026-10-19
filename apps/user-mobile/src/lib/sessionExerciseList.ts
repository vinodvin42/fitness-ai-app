import type { SessionExerciseSource, WorkoutDetail, WorkoutExercise, WorkoutSession } from "@fitness-ai-app/types";
import { applySwaps } from "./exerciseSwaps";
import { sortExercisesByPhase } from "./workoutExercises";

/**
 * One exercise as Active Workout and the Set/Rest Tracker show it (Batch 3b,
 * 18 Oct 2026). Both screens address exercises by position, so they must build
 * the list the same way: the session's own list from the API when it has one
 * (swaps, added exercises and supersets live there), otherwise the workout
 * template with this device's client-side swaps — the pre-Batch-3 behaviour.
 */
export interface SessionExerciseView extends WorkoutExercise {
  /** Server row id; null when the list came from the template. */
  sessionExerciseId: string | null;
  supersetGroup: string | null;
  /** Rest for this exercise (the user's choice, else their default); null = use Workout settings. */
  restSeconds: number | null;
  source: SessionExerciseSource;
}

export function buildSessionExerciseList(
  workout: Pick<WorkoutDetail, "exercises"> | undefined,
  session: Pick<WorkoutSession, "exercises"> | undefined,
  swaps: Parameters<typeof applySwaps>[1],
): SessionExerciseView[] {
  const fromServer = session?.exercises ?? [];
  if (fromServer.length > 0) {
    return fromServer.map((e) => ({
      id: e.id ?? e.workoutExerciseId ?? e.exerciseId,
      exercise: e.exercise,
      phase: e.phase,
      order: e.order,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      sessionExerciseId: e.id,
      supersetGroup: e.supersetGroup,
      restSeconds: e.restSeconds,
      source: e.source,
    }));
  }
  if (!workout) return [];
  return sortExercisesByPhase(applySwaps(workout.exercises, swaps)).map((w) => ({
    ...w,
    sessionExerciseId: null,
    supersetGroup: null,
    restSeconds: null,
    source: "plan" as const,
  }));
}
