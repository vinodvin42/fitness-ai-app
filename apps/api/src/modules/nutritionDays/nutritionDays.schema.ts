import { z } from "zod";

// Fuel gaps: edit a logged meal, per-day summary, month calendar.
export const updateMealLogSchema = z
  .object({
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    calories: z.number().int().nonnegative().max(10000).optional(),
    proteinG: z.number().int().nonnegative().max(1000).optional(),
    carbsG: z.number().int().nonnegative().max(1000).optional(),
    fatG: z.number().int().nonnegative().max(1000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });
export type UpdateMealLogInput = z.infer<typeof updateMealLogSchema>;

export const summaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "date is not a real calendar date"),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
