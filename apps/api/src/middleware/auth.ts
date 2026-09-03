import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { ApiHttpError } from "./errorHandler";

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Verifies the Bearer access token and attaches userId/userEmail to the
 * request. This is the ONE place token verification happens — per the
 * Figma file's own disclaimer ("Permissions are enforced by backend. UI
 * visibility is supplementary, not authoritative" — docs/admin/03-screen-inventory.md
 * 12.02), every mutating route must sit behind this, not rely on the
 * client to behave.
 */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiHttpError(401, "unauthorized", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    throw new ApiHttpError(401, "unauthorized", "Invalid or expired access token");
  }
}
