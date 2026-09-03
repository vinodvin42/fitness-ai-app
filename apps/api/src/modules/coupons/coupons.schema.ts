import { z } from "zod";

/**
 * Coupons — consumer validate endpoint (added 31 Aug 2026). See
 * coupons.service.ts's doc comment.
 */
export const validateCouponSchema = z.object({
  code: z.string().trim().min(1).max(40),
  // The order amount (in cents) the client wants to apply the code against —
  // the discount is always recomputed server-side from the real plan/program
  // price at order time, so this is only for the pre-checkout preview.
  amountCents: z.number().int().min(1),
});
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
