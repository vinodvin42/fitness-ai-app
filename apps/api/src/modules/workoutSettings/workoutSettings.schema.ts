import { z } from "zod";

// Train 16 — send only what changed.
export const updateWorkoutSettingsSchema = z
  .object({
    restTimerSeconds: z.number().int().min(10).max(600).optional(),
    autoStartRest: z.boolean().optional(),
    weightUnit: z.enum(["kg", "lb"]).optional(),
    countdownSound: z.boolean().optional(),
    keepScreenAwake: z.boolean().optional(),
    defaultRpeTracking: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one setting to update" });
export type UpdateWorkoutSettingsInput = z.infer<typeof updateWorkoutSettingsSchema>;
