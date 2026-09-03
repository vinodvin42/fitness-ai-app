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
};

export const createReminderSchema = z.object(baseReminderFields);
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
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
