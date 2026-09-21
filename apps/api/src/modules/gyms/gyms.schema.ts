import { z } from "zod";

/**
 * Gym Partner Lite — R1 Wave 1 (added 20 Sep 2026). See gyms.service.ts's
 * own doc comment for the full context. Id conventions match this
 * codebase's established "plain String, not @db.Uuid" precedent (see
 * memory note prisma-stub-and-id-conventions) — `.min(1).max(191)`, never
 * `.uuid()`.
 */

const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  equipment: z.string().trim().max(2000).optional(),
});

export const createGymSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().max(40).optional(),
  commissionPct: z.number().int().min(0).max(100).default(15),
  pricingModel: z.string().trim().min(1).max(60).default("per_member_flat_fee"),
  ratePerMemberCents: z.number().int().min(0).default(0),
  locations: z.array(locationInputSchema).max(50).optional(),
});
export type CreateGymInput = z.infer<typeof createGymSchema>;

export const listGymsQuerySchema = z.object({
  status: z.enum(["application", "approved", "suspended"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListGymsQuery = z.infer<typeof listGymsQuerySchema>;

export const updateGymStatusSchema = z.object({
  status: z.enum(["approved", "suspended"]),
  note: z.string().trim().max(500).optional(),
});
export type UpdateGymStatusInput = z.infer<typeof updateGymStatusSchema>;

export const updateGymCommercialSchema = z
  .object({
    commissionPct: z.number().int().min(0).max(100),
    pricingModel: z.string().trim().min(1).max(60),
    ratePerMemberCents: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateGymCommercialInput = z.infer<typeof updateGymCommercialSchema>;

export const addGymLocationSchema = locationInputSchema;
export type AddGymLocationInput = z.infer<typeof addGymLocationSchema>;

// Gym Partner Lite portal (R2 Wave 5, 21 Sep 2026) — admin-set bootstrap for
// a Gym's own portal login. See gyms.service.ts#setGymPortalPassword's own
// doc comment for the full onboarding-mechanism decision.
export const setGymPortalPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type SetGymPortalPasswordInput = z.infer<typeof setGymPortalPasswordSchema>;
