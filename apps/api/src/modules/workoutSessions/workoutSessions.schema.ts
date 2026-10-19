import { z } from "zod";

/**
 * A set is one type at most: warm-up, drop or to failure (Batch 3a, 18 Oct
 * 2026 — before this the app's single "Drop Set / Failure" toggle wrote
 * isDropSet). Shared by log-set and edit-set validation.
 */
export function oneSetType(d: { isWarmup?: boolean | null; isDropSet?: boolean | null; isFailure?: boolean | null }): boolean {
  return [d.isWarmup, d.isDropSet, d.isFailure].filter(Boolean).length <= 1;
}
export const SET_TYPE_MESSAGE = "A set can be a warm-up, a drop set or to failure — not more than one";

export const logSetSchema = z
  .object({
    // String id (uuid is only the default generator; seed uses "ex-squat").
    // See coaching.schema.ts's createBookingSchema comment — found 31 Aug 2026.
    exerciseId: z.string().min(1).max(191),
    setNumber: z.number().int().positive(),
    weightKg: z.number().positive().optional(),
    reps: z.number().int().nonnegative(),
    rpe: z.number().min(1).max(10).optional(),
    // Set/Rest Tracker fields (docs/mobile/03-screen-inventory.md §C trn-08) —
    // all optional so the plain Active Workout log-set form (which doesn't
    // send them) keeps working unchanged.
    isWarmup: z.boolean().optional(),
    isDropSet: z.boolean().optional(),
    isFailure: z.boolean().optional(),
    note: z.string().trim().max(280).optional(),
  })
  .refine(oneSetType, { message: SET_TYPE_MESSAGE, path: ["isFailure"] });

export type LogSetInput = z.infer<typeof logSetSchema>;

// U3 (15 Sep 2026) — see workoutSessions.service.ts's updateProgress comment.
export const updateProgressSchema = z.object({
  currentExerciseIndex: z.number().int().nonnegative(),
});

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;

// ---- Batch 3a: the session's own exercise list ---------------------------

const exerciseIdSchema = z.string().min(1).max(191);
const targetSetsSchema = z.number().int().min(1).max(20);
const targetRepsSchema = z.number().int().min(1).max(100);
/** "A".."Z" — one letter per superset group. */
const supersetGroupSchema = z.string().regex(/^[A-Z]$/, "Use a single capital letter, e.g. A");

export const addSessionExerciseSchema = z.object({
  exerciseId: exerciseIdSchema,
  targetSets: targetSetsSchema.optional(),
  targetReps: targetRepsSchema.optional(),
});
export type AddSessionExerciseInput = z.infer<typeof addSessionExerciseSchema>;

export const updateSessionExerciseSchema = z
  .object({
    /** Swap to another exercise (only while none of this entry's sets are logged). */
    exerciseId: exerciseIdSchema.optional(),
    supersetGroup: supersetGroupSchema.nullable().optional(),
    targetSets: targetSetsSchema.optional(),
    targetReps: targetRepsSchema.optional(),
    /** New 0-based position in the list; the others shift to make room. */
    order: z.number().int().nonnegative().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });
export type UpdateSessionExerciseInput = z.infer<typeof updateSessionExerciseSchema>;

export const sessionFeelSchema = z.object({
  feel: z.enum(["easy", "about_right", "hard"]).nullable(),
});
export type SessionFeelInput = z.infer<typeof sessionFeelSchema>;
