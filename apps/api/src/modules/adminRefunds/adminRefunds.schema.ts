import { z } from "zod";

/**
 * Module 06.04 — Refunds (added 31 Aug 2026). See adminRefunds.service.ts.
 */
export const listRefundsQuerySchema = z.object({
  status: z.enum(["pending", "processed", "failed"]).optional(),
});
export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;

export const createRefundSchema = z.object({
  amountCents: z.number().int().min(1),
  reason: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
