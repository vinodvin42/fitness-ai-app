import { z } from "zod";

/**
 * Recovery & Devices — manual-entry stopgap (added 31 Aug 2026). See
 * recovery.service.ts's doc comment. Every metric is optional — a user can
 * log just sleep, or just soreness, on any given day.
 */
export const upsertRecoverySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    restingHeartRate: z.number().int().min(20).max(220).optional(),
    sleepHours: z.number().min(0).max(24).optional(),
    hrvMs: z.number().int().min(0).max(400).optional(),
    soreness: z.number().int().min(1).max(5).optional(),
    energyLevel: z.number().int().min(1).max(5).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) =>
      v.restingHeartRate != null ||
      v.sleepHours != null ||
      v.hrvMs != null ||
      v.soreness != null ||
      v.energyLevel != null ||
      (v.notes != null && v.notes.length > 0),
    { message: "Log at least one metric" },
  );
export type UpsertRecoveryInput = z.infer<typeof upsertRecoverySchema>;
