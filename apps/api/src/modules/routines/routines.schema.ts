import { z } from "zod";

// Train 13 "My Routines". exercises[] order is the routine order.
const routineExerciseInput = z.object({
  exerciseId: z.string().min(1).max(191),
  targetSets: z.number().int().min(1).max(20).default(3),
  targetReps: z.number().int().min(1).max(200).default(10),
  restSeconds: z.number().int().min(0).max(600).nullable().optional(),
});

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(500).optional(),
  exercises: z.array(routineExerciseInput).max(50).default([]),
});
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;

// PATCH: send only what changed; `exercises` replaces the whole list.
export const updateRoutineSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    exercises: z.array(routineExerciseInput).max(50).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
