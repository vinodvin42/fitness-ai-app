import { z } from "zod";

export const logSetSchema = z.object({
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
  note: z.string().trim().max(280).optional(),
});

export type LogSetInput = z.infer<typeof logSetSchema>;

// U3 (15 Sep 2026) — see workoutSessions.service.ts's updateProgress comment.
export const updateProgressSchema = z.object({
  currentExerciseIndex: z.number().int().nonnegative(),
});

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
