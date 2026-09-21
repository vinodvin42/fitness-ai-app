import { z } from "zod";

/**
 * Creator Portal (R2 Wave 5, 21 Sep 2026). No signup schema — unlike
 * Professional/User, an `Influencer` is created by an admin first (Module
 * 07 Influencers), and only gains portal access once an admin explicitly
 * sets a password via `POST /admin/influencers/:id/portal-password` (see
 * adminInfluencers.schema.ts's `setPortalPasswordSchema`). This module is
 * login/refresh/logout/me only.
 */
export const influencerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const influencerRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type InfluencerLoginInput = z.infer<typeof influencerLoginSchema>;
