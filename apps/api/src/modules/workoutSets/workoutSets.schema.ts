import { z } from "zod";
import { oneSetType, SET_TYPE_MESSAGE } from "../workoutSessions/workoutSessions.schema";

// Edit a logged set — send only what changed. weightKg/rpe/note accept null to clear.
export const updateSetSchema = z
  .object({
    weightKg: z.number().positive().max(2000).nullable().optional(),
    reps: z.number().int().nonnegative().max(1000).optional(),
    rpe: z.number().min(1).max(10).nullable().optional(),
    isWarmup: z.boolean().optional(),
    isDropSet: z.boolean().optional(),
    // Batch 3a (18 Oct 2026): drop and failure are separate types now.
    isFailure: z.boolean().optional(),
    note: z.string().trim().max(280).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" })
  .refine(oneSetType, { message: SET_TYPE_MESSAGE, path: ["isFailure"] });
export type UpdateSetInput = z.infer<typeof updateSetSchema>;
