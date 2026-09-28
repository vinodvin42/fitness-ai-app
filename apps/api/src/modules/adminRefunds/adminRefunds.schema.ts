import { z } from "zod";
import { MIN_REASON_LENGTH } from "../../lib/highImpactAction";

/**
 * Module 06.04 — Refunds (added 31 Aug 2026). See adminRefunds.service.ts.
 */
export const listRefundsQuerySchema = z.object({
  status: z.enum(["pending", "processed", "failed"]).optional(),
});
export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;

/**
 * BR-ADM-005: a refund moves real money, so it is a high-impact action —
 * `reason` is required (it was `.optional()` before R1, which is what
 * made acceptance test 16 fail) and the caller must type the
 * confirmation word. Both are re-checked in the service layer via
 * `assertHighImpactConfirmed`, so a future route that forgets this
 * schema still cannot skip the gate.
 */
export const createRefundSchema = z.object({
  amountCents: z.number().int().min(1),
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
  confirmation: z.string().trim(),
  note: z.string().trim().max(500).optional(),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
