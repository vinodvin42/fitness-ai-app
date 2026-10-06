import { z } from "zod";

/** Equipment chips on the Preferences screen (Train 16). */
export const WORKOUT_EQUIPMENT = ["barbell", "dumbbells", "cables", "machines", "bands", "kettlebells", "bodyweight"] as const;
export const TRAINING_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Train 16 — send only what changed.
export const updateWorkoutSettingsSchema = z
  .object({
    restTimerSeconds: z.number().int().min(10).max(600).optional(),
    autoStartRest: z.boolean().optional(),
    weightUnit: z.enum(["kg", "lb"]).optional(),
    countdownSound: z.boolean().optional(),
    keepScreenAwake: z.boolean().optional(),
    defaultRpeTracking: z.boolean().optional(),
    preferredDurationMinutes: z.number().int().min(15).max(120).optional(),
    audioCoaching: z.boolean().optional(),
    autoDeloadWeek: z.boolean().optional(),
    equipment: z.array(z.enum(WORKOUT_EQUIPMENT)).max(WORKOUT_EQUIPMENT.length).optional(),
    trainingDays: z.array(z.enum(TRAINING_DAYS)).max(TRAINING_DAYS.length).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one setting to update" });
export type UpdateWorkoutSettingsInput = z.infer<typeof updateWorkoutSettingsSchema>;
