/**
 * Shapes for the seed content modules in this directory.
 *
 * These mirror the relevant Prisma models rather than importing their
 * generated types on purpose: a seed row is the *input* to an upsert, so it
 * carries no `createdAt`/`updatedAt`/`status`, and its `id` is a required,
 * hand-chosen, readable string (`prog-…`, `ex-…`, `rec-…`, `wk-…`) rather
 * than a generated uuid. Those stable ids are what make re-seeding idempotent
 * and what workouts.ts references, so they are never optional here.
 */

export type SeedProgramType = "fitness" | "nutrition" | "combined";
export type SeedDifficulty = "beginner" | "intermediate" | "advanced";
export type SeedMealType = "breakfast" | "lunch" | "dinner" | "snack";
export type SeedWorkoutPhase = "warmup" | "main" | "cooldown";

export interface SeedProgram {
  id: string;
  name: string;
  type: SeedProgramType;
  description: string;
  durationWeeks: number;
  isAiOnly: boolean;
  priceCents: number;
  /** Cover art. Nullable in the schema, but every seeded program has one. */
  imageUrl: string;
}

export interface SeedExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: SeedDifficulty;
  /** Absent for the two exercises the public-domain photo source has no real match for. */
  mediaUrl?: string;
  instructions: string[];
}

export interface SeedRecipe {
  id: string;
  name: string;
  mealType: SeedMealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTimeMinutes: number;
  tags: string[];
  imageUrl: string;
}

/**
 * One line of a workout: [exerciseId, phase, targetSets, targetReps].
 *
 * A tuple rather than an object because a workout is a list of ~7 of these
 * and the object form buried the actual programming under repeated keys.
 * `order` is not in the tuple — it is derived from position within the phase
 * when the workout is written, so re-ordering a list here is all it takes.
 *
 * A time-based movement (a plank hold, a warm-up jog, a stretch) is written
 * as reps `1`: the schema has no duration field on WorkoutExercise, and the
 * Active Workout screen counts sets either way. Called out because "3 x 1"
 * reads like a mistake otherwise.
 */
export type SeedExerciseSpec = [
  exerciseId: string,
  phase: SeedWorkoutPhase,
  targetSets: number,
  targetReps: number,
];

export interface SeedWorkout {
  id: string;
  programId: string;
  name: string;
  order: number;
  durationMinutes: number;
  intensity: SeedDifficulty;
  exercises: SeedExerciseSpec[];
}
