import { z } from "zod";
import { isValidEffectiveFrom } from "../../lib/indiaTime";
import { MIN_REASON_LENGTH } from "../../lib/highImpactAction";

/**
 * Coach levels, services, fees and FynroX commission (Package 4). Every
 * write needs a reason; anyone but the Super Admin gets an approval
 * request instead of the change (maker-checker, D21).
 */

const reason = z.string().trim().min(MIN_REASON_LENGTH, `Give a reason (at least ${MIN_REASON_LENGTH} characters)`).max(2000);
// A date (YYYY-MM-DD, India time) or a full ISO timestamp. Omitted = now.
const effectiveFrom = z.string().trim().refine(isValidEffectiveFrom, "Enter a valid date").optional();

export const createLevelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional(),
  reason: reason.optional(),
});
export type CreateLevelInput = z.infer<typeof createLevelSchema>;

export const updateLevelSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    reason: reason.optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.isActive !== undefined, "Nothing to change");
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;

export const createServiceSchema = z.object({
  label: z.string().trim().min(1).max(80),
  // null = a combined fitness + nutrition session.
  serviceType: z.enum(["fitness", "nutrition"]).nullable(),
  durationMinutes: z.number().int().min(10).max(240),
  reason: reason.optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    durationMinutes: z.number().int().min(10).max(240).optional(),
    isActive: z.boolean().optional(),
    reason: reason.optional(),
  })
  .refine((v) => v.label !== undefined || v.durationMinutes !== undefined || v.isActive !== undefined, "Nothing to change");
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const setLevelFeeSchema = z.object({
  serviceId: z.string().min(1).max(191),
  // Fee before GST, in paise. 0 = a free session.
  priceCents: z.number().int().min(0).max(100_000_00),
  effectiveFrom,
  reason,
});
export type SetLevelFeeInput = z.infer<typeof setLevelFeeSchema>;

export const setDefaultCommissionSchema = z.object({
  pct: z.number().int().min(0).max(100),
  effectiveFrom,
  reason,
});
export type SetDefaultCommissionInput = z.infer<typeof setDefaultCommissionSchema>;

export const setCoachCommissionSchema = z.object({
  // null = this coach goes back to FynroX's default rate.
  pct: z.number().int().min(0).max(100).nullable(),
  effectiveFrom,
  reason,
});
export type SetCoachCommissionInput = z.infer<typeof setCoachCommissionSchema>;

export const assignCoachLevelSchema = z.object({
  // null = take the coach out of every level (they can't be booked).
  coachLevelId: z.string().min(1).max(191).nullable(),
  reason,
});
export type AssignCoachLevelInput = z.infer<typeof assignCoachLevelSchema>;
