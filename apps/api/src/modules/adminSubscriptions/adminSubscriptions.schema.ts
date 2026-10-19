import { BillingCycle, SubscriptionStatus, SubscriptionTier } from "@prisma/client";
import { z } from "zod";
import { MIN_REASON_LENGTH } from "../../lib/highImpactAction";

// Gap §57 (18 Sep 2026) — real admin force-revoke. `reason` is required
// and meaningful (not just a non-empty string) — mirrors the same
// min-length discipline UserProfileScreen.tsx's sensitive-access-request
// reason field already uses (min 10 chars), since this is an even more
// consequential, harder-to-reverse action.
export const revokeSubscriptionSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export type RevokeSubscriptionInput = z.infer<typeof revokeSubscriptionSchema>;

// Gap §57 follow-up (22 Sep 2026) — real admin un-revoke, the reverse of
// force-revoke. Same reason-required discipline (BR-ADM-005) as the
// original revoke — reversing a high-impact action is itself high-impact
// and needs its own reason on the audit trail, not a blank re-use of the
// original revoke reason.
export const unrevokeSubscriptionSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export type UnrevokeSubscriptionInput = z.infer<typeof unrevokeSubscriptionSchema>;

/**
 * U-M4's suspend/reactivate payload. Takes the typed confirmation the
 * revoke schemas above predate — BR-ADM-005 applies to every action that
 * removes paid-for access, not only the terminal one.
 */
export const highImpactSubscriptionSchema = z.object({
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
  confirmation: z.string().trim(),
});
export type HighImpactSubscriptionInput = z.infer<typeof highImpactSubscriptionSchema>;

// 06.01 Subscriptions list (Oct 2026). Filters use the Prisma enums
// themselves, so a new status or tier can never drift from the database.
export const listSubscriptionsQuerySchema = z.object({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  tier: z.nativeEnum(SubscriptionTier).optional(),
  billingCycle: z.nativeEnum(BillingCycle).optional(),
  search: z.string().trim().max(200).optional(),
});
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
