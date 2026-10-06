import { useSyncExternalStore } from "react";
import type { Exercise, WorkoutExercise } from "@fitness-ai-app/types";

/**
 * Client-only exercise swaps for a workout (Train 09). There is no backend
 * endpoint to replace a WorkoutExercise, so swaps live in memory, keyed by
 * workoutId then WorkoutExercise.id, and are applied on top of the fetched
 * workout by Workout Detail / Active Workout. They last until the session is
 * finished/abandoned (clearSwaps) or the app restarts.
 */
type SwapMap = Record<string, Exercise>;
const swapsByWorkout = new Map<string, SwapMap>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function setSwap(workoutId: string, workoutExerciseId: string, replacement: Exercise | null) {
  const current = { ...(swapsByWorkout.get(workoutId) ?? {}) };
  if (replacement) current[workoutExerciseId] = replacement;
  else delete current[workoutExerciseId];
  swapsByWorkout.set(workoutId, current);
  emit();
}

export function clearSwaps(workoutId: string) {
  if (swapsByWorkout.delete(workoutId)) emit();
}

const EMPTY: SwapMap = {};

/** Subscribes to the swaps for one workout. */
export function useSwaps(workoutId: string): SwapMap {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => version,
  );
  return swapsByWorkout.get(workoutId) ?? EMPTY;
}

export function applySwaps(exercises: WorkoutExercise[], swaps: SwapMap): WorkoutExercise[] {
  return exercises.map((we) => (swaps[we.id] ? { ...we, exercise: swaps[we.id] } : we));
}
