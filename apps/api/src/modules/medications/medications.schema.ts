import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// daysOfWeek uses JS getDay() (0 = Sunday .. 6 = Saturday), like reminders.
const nameField = z.string().trim().min(1).max(120);
const dosageField = z.string().trim().min(1).max(80);
const formField = z.string().trim().max(40).nullable().optional();
const timesField = z.array(hhmm).min(1).max(12);
const daysField = z.array(z.number().int().min(0).max(6)).min(1).max(7);
const notesField = z.string().trim().max(500).nullable().optional();

export const createMedicationSchema = z
  .object({
    name: nameField,
    dosage: dosageField,
    form: formField,
    scheduleTimes: timesField,
    daysOfWeek: daysField.default([0, 1, 2, 3, 4, 5, 6]),
    startDate: dateOnly,
    endDate: dateOnly.nullable().optional(),
    notes: notesField,
    isActive: z.boolean().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "endDate must not be before startDate" });
export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;

export const updateMedicationSchema = z
  .object({
    name: nameField.optional(),
    dosage: dosageField.optional(),
    form: formField,
    scheduleTimes: timesField.optional(),
    daysOfWeek: daysField.optional(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.nullable().optional(),
    notes: notesField,
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
export type UpdateMedicationInput = z.infer<typeof updateMedicationSchema>;

// tzOffsetMinutes follows JS Date.getTimezoneOffset() (UTC minus local, so
// UTC+5:30 is -330), letting the server resolve the client's local "today".
export const dayQuerySchema = z.object({
  date: dateOnly.optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
});
export type DayQuery = z.infer<typeof dayQuerySchema>;

export const logDoseSchema = z
  .object({
    scheduledFor: z.string().datetime(),
    status: z.enum(["taken", "skipped", "snoozed"]),
    snoozedUntil: z.string().datetime().optional(),
  })
  .refine((v) => v.status !== "snoozed" || !!v.snoozedUntil, {
    message: "snoozedUntil is required when status is snoozed",
    path: ["snoozedUntil"],
  });
export type LogDoseInput = z.infer<typeof logDoseSchema>;
