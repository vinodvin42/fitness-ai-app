import { z } from "zod";

// Mirrors prisma/schema.prisma's SubscriptionTier/BillingCycle enums exactly.
export const subscriptionTiers = ["basic", "pro", "elite"] as const;
export const billingCycles = ["monthly", "annual"] as const;

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
