import { z } from "zod";

/**
 * Module 07 Influencers + 10.07 Payouts (added 31 Aug 2026). See
 * adminInfluencers.service.ts's doc comment.
 */
export const listInfluencersQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListInfluencersQuery = z.infer<typeof listInfluencersQuerySchema>;

export const createInfluencerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional(),
  handle: z.string().trim().max(80).optional(),
  platform: z.string().trim().max(40).optional(),
  commissionPct: z.number().int().min(0).max(100).default(20),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateInfluencerInput = z.infer<typeof createInfluencerSchema>;

export const updateInfluencerSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().nullable(),
    handle: z.string().trim().max(80).nullable(),
    platform: z.string().trim().max(40).nullable(),
    commissionPct: z.number().int().min(0).max(100),
    status: z.enum(["active", "inactive"]),
    notes: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateInfluencerInput = z.infer<typeof updateInfluencerSchema>;

export const createPayoutSchema = z.object({
  amountCents: z.number().int().min(1),
  periodLabel: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});
export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;
