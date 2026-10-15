import { z } from "zod";

// Mirrors prisma/schema.prisma's SubscriptionTier/BillingCycle enums exactly.
export const subscriptionTiers = ["basic", "grow", "prime"] as const;
export const billingCycles = ["monthly", "quarterly", "annual"] as const;

export const listPlansQuerySchema = z.object({
  tier: z.enum(subscriptionTiers).optional(),
  billingCycle: z.enum(billingCycles).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tier: z.enum(subscriptionTiers),
  billingCycle: z.enum(billingCycles),
  priceCents: z.number().int().min(0),
});

export const updatePlanSchema = createPlanSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "At least one field is required",
});

export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// Scheduled price change (decisions D8/D18). `effectiveFrom` is a date
// (YYYY-MM-DD, India time) or a full ISO timestamp.
export const schedulePriceChangeSchema = z.object({
  priceCents: z.number().int().min(0),
  effectiveFrom: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:30` : v)), "Enter a valid date"),
  reason: z.string().trim().max(2000).optional(),
});

export type SchedulePriceChangeInput = z.infer<typeof schedulePriceChangeSchema>;
