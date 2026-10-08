import { z } from "zod";
import { HHMM_RE, parseDays } from "../../lib/gymHours";

const hhmm = z.string().regex(HHMM_RE, "Use HH:MM (24-hour)");
const daysExpr = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((v) => parseDays(v) !== null, "Use daily, a day (mon), a list (mon,wed) or a range (mon-sat)");

const timingBase = z.object({
  label: z.string().trim().min(1).max(80),
  days: daysExpr,
  opensAt: hhmm.nullable().optional(),
  closesAt: hhmm.nullable().optional(),
  closed: z.boolean().optional(),
  kind: z.enum(["regular", "women_only", "special"]).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const createTimingSchema = timingBase.refine((v) => v.closed || (v.opensAt && v.closesAt), {
  message: "Opening and closing times are required unless the gym is closed",
});
export const updateTimingSchema = timingBase.partial();

export const createEquipmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // An Exercise.equipment value, e.g. "Machine", "Cable machine", "Barbell".
  category: z.string().trim().min(1).max(60),
  exerciseKeyword: z.string().trim().max(40).nullable().optional(),
  quantity: z.number().int().min(0).max(1000).nullable().optional(),
  available: z.boolean().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});
export const updateEquipmentSchema = createEquipmentSchema.partial();

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
  kind: z.enum(["holiday", "notice"]).default("notice"),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1).max(191) });
