import { NextFunction, Request, Response } from "express";
import { verifyProfessionalAccessToken } from "../lib/professionalJwt";
import { ApiHttpError } from "./errorHandler";

export interface ProfessionalAuthedRequest extends Request {
  professionalId?: string;
  professionalEmail?: string;
}

/** Coach marketplace (Phase 5) equivalent of middleware/auth.ts's requireAuth — verifies a Professional Bearer token. */
export function requireProfessionalAuth(req: ProfessionalAuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiHttpError(401, "unauthorized", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyProfessionalAccessToken(token);
    req.professionalId = payload.sub;
    req.professionalEmail = payload.email;
    next();
  } catch {
    throw new ApiHttpError(401, "unauthorized", "Invalid or expired professional access token");
  }
}
