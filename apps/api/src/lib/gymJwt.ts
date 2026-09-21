import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Gym Partner Lite portal (R2 Wave 5, 21 Sep 2026) — mirrors lib/adminJwt.ts's
 * shape exactly (single access token, no refresh — see config/env.ts's
 * GYM_JWT_SECRET comment for why this follows the AdminUser precedent
 * rather than the Professional one), for the `Gym` identity. Own secret,
 * own token type, never interchangeable with a consumer/admin/professional
 * token — same discipline as every other identity's JWT helper in this
 * codebase.
 */
export interface GymAccessTokenPayload {
  sub: string; // Gym id
  contactEmail: string;
}

export function signGymAccessToken(payload: GymAccessTokenPayload): { token: string; expiresAt: number } {
  const expiresInSeconds = env.GYM_JWT_ACCESS_TTL_MIN * 60;
  const token = jwt.sign(payload, env.GYM_JWT_SECRET, { expiresIn: expiresInSeconds });
  return { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function verifyGymAccessToken(token: string): GymAccessTokenPayload {
  return jwt.verify(token, env.GYM_JWT_SECRET) as GymAccessTokenPayload;
}
