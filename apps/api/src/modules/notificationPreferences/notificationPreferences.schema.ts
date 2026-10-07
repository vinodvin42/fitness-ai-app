import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const updateNotificationPreferencesSchema = z
  .object({
    workoutReminders: z.boolean().optional(),
    mealReminders: z.boolean().optional(),
    coachMessages: z.boolean().optional(),
    billing: z.boolean().optional(),
    marketing: z.boolean().optional(),
    masterEnabled: z.boolean().optional(),
    hydrationReminders: z.boolean().optional(),
    // Max notifications per rolling 24h; null = no cap.
    frequencyCap: z.number().int().min(1).max(50).nullable().optional(),
    quietHoursStart: hhmm.nullable().optional(),
    quietHoursEnd: hhmm.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
