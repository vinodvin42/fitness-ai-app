import { NextFunction, Request, Response } from "express";
import { verifyInfluencerAccessToken } from "../lib/influencerJwt";
import { ApiHttpError } from "./errorHandler";

export interface InfluencerAuthedRequest extends Request {
  influencerId?: string;
  influencerEmail?: string;
}

/**
 * Creator Portal (R2 Wave 5) equivalent of middleware/professionalAuth.ts's
 * requireProfessionalAuth — verifies an Influencer Bearer token. Every
 * influencer-portal route handler reads the influencer id ONLY from
 * `req.influencerId` set here (never from a request body/param), so an
 * influencer can never view another influencer's campaigns or payouts by
 * passing an arbitrary id — see influencerPortal.routes.ts.
 */
export function requireInfluencerAuth(req: InfluencerAuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiHttpError(401, "unauthorized", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyInfluencerAccessToken(token);
    req.influencerId = payload.sub;
    req.influencerEmail = payload.email;
    next();
  } catch {
    throw new ApiHttpError(401, "unauthorized", "Invalid or expired influencer access token");
  }
}
