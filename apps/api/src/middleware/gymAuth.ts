import { NextFunction, Request, Response } from "express";
import { verifyGymAccessToken } from "../lib/gymJwt";
import { ApiHttpError } from "./errorHandler";

export interface GymAuthedRequest extends Request {
  gymId?: string;
  gymContactEmail?: string;
}

/**
 * Gym Partner Lite portal (R2 Wave 5, 21 Sep 2026) equivalent of
 * middleware/adminAuth.ts's requireAdminAuth — verifies a Gym Bearer token
 * (signed with GYM_JWT_SECRET, never any other identity's secret) and
 * attaches gymId/gymContactEmail. This is the ONLY place gym-portal
 * identity is established; every gym-portal route below trusts req.gymId
 * from here, never from a client-supplied `:id`/body field — that's what
 * keeps a gym confined to its own data (BR-GYM-003).
 */
export function requireGymAuth(req: GymAuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiHttpError(401, "unauthorized", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyGymAccessToken(token);
    req.gymId = payload.sub;
    req.gymContactEmail = payload.contactEmail;
    next();
  } catch {
    throw new ApiHttpError(401, "unauthorized", "Invalid or expired gym access token");
  }
}
