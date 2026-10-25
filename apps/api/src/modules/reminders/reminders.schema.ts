import { z } from "zod";

// Add Reminder (docs/mobile/03-screen-inventory.md §K). daysOfWeek uses
// JS's Date.getDay() convention (0 = Sunday .. 6 = Saturday) throughout
// this module, including on the client where it's used to schedule local
// notifications — see apps/user-mobile's src/lib/reminderNotifications.ts.
export const reminderCategorySchema = z.enum(["workout", "meal", "water", "measurement", "general"]);

const baseReminderFields = {
  category: reminderCategorySchema.default("general"),
  label: z.string().min(1).max(80),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  playSound: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
  // Optional date range (25 Oct 2026): first and last calendar day, YYYY-MM-DD; null = no limit.
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").nullable().optional(),
};

const endNotBeforeStart = (v: { startDate?: string | null; endDate?: string | null }) => !v.startDate || !v.endDate || v.endDate >= v.startDate;
const END_MESSAGE = { message: "The end date can't be before the start date", path: ["endDate"] };

export const createReminderSchema = z.object(baseReminderFields).refine(endNotBeforeStart, END_MESSAGE);
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const updateReminderSchema = z
  .object({
    category: reminderCategorySchema.optional(),
    label: z.string().min(1).max(80).optional(),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    playSound: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    startDate: baseReminderFields.startDate,
    endDate: baseReminderFields.endDate,
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" })
  .refine(endNotBeforeStart, END_MESSAGE);
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
