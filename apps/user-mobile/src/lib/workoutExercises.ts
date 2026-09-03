import type { WorkoutExercise } from "@fitness-ai-app/types";

const PHASE_ORDER: Record<WorkoutExercise["phase"], number> = { warmup: 0, main: 1, cooldown: 2 };

/**
 * Shared ordering used by both Active Workout (trn-07) and Set/Rest Tracker
 * (trn-08) so the two screens agree on "which exercise is exercise N" —
 * extracted here rather than duplicated after Set/Rest Tracker needed the
 * same list ActiveWorkoutScreen already computed with a local `useMemo`.
 */
export function sortExercisesByPhase(exercises: WorkoutExercise[]): WorkoutExercise[] {
  return [...exercises].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.order - b.order);
}

export function phaseLabel(phase: WorkoutExercise["phase"]): string {
  if (phase === "warmup") return "Warm-Up";
  if (phase === "cooldown") return "Cooldown";
  return "Strength Training";
}
