import { z } from "zod";

// Gap §57 (18 Sep 2026) — real admin force-revoke. `reason` is required
// and meaningful (not just a non-empty string) — mirrors the same
// min-length discipline UserProfileScreen.tsx's sensitive-access-request
// reason field already uses (min 10 chars), since this is an even more
// consequential, harder-to-reverse action.
export const revokeSubscriptionSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export type RevokeSubscriptionInput = z.infer<typeof revokeSubscriptionSchema>;
