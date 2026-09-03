import { z } from "zod";

/**
 * Module 06.05 — Coupons (added 31 Aug 2026). See adminCoupons.service.ts.
 */
export const listCouponsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

export const createCouponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(["percent", "fixed"]),
  // Whole percent (1-100) for `percent`, or a cent amount for `fixed`.
  discountValue: z.number().int().min(1),
  maxRedemptions: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime({ message: "expiresAt must be ISO 8601" }).optional(),
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z
  .object({
    description: z.string().trim().max(200).nullable(),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.number().int().min(1),
    maxRedemptions: z.number().int().min(1).nullable(),
    isActive: z.boolean(),
    expiresAt: z.string().datetime().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
