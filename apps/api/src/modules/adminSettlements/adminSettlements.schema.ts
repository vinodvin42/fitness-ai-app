import { z } from "zod";

/**
 * Module 10.06 — Coach Settlements (added 31 Aug 2026). See
 * adminSettlements.service.ts's doc comment.
 */

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const listSettlementsQuerySchema = z.object({
  month: z.string().regex(monthRegex, "month must be YYYY-MM").optional(),
});
export type ListSettlementsQuery = z.infer<typeof listSettlementsQuerySchema>;

export const setCommissionSchema = z.object({
  commissionPct: z.number().int().min(0).max(100),
});
export type SetCommissionInput = z.infer<typeof setCommissionSchema>;

export const settleCoachSchema = z.object({
  // String id (uuid is only the default generator; seeded coaches use
  // readable ids). See coaching.schema.ts's createBookingSchema comment.
  professionalId: z.string().min(1).max(191),
  month: z.string().regex(monthRegex, "month must be YYYY-MM").optional(),
  note: z.string().trim().max(500).optional(),
});
export type SettleCoachInput = z.infer<typeof settleCoachSchema>;
