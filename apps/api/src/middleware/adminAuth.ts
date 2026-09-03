import { NextFunction, Request, Response } from "express";
import { verifyAdminAccessToken } from "../lib/adminJwt";
import { ApiHttpError } from "./errorHandler";

export interface AdminAuthedRequest extends Request {
  adminUserId?: string;
  adminEmail?: string;
  adminRole?: string;
}

/**
 * Admin-console equivalent of middleware/auth.ts's requireAuth — verifies
 * an admin Bearer token (signed with ADMIN_JWT_SECRET, never the consumer
 * JWT_ACCESS_SECRET) and attaches adminUserId/adminEmail/adminRole.
 *
 * Per the Figma file's own disclaimer, preserved verbatim in
 * docs/admin/03-screen-inventory.md 12.02 — "Permissions are enforced by
 * backend. UI visibility is supplementary, not authoritative" — this is
 * the one place admin identity is established; this function alone only
 * checks for *a* valid admin session, not a role-specific grant.
 *
 * **25 Aug 2026:** the per-role permission check this comment used to call
 * "unblocked follow-up work" is real now — see `requirePermission()` in
 * ./adminPermissions.ts, which every admin route that maps to a real
 * module/action now calls in addition to this function. The other 7
 * roles' matrices are still a derived starter set pending product
 * confirmation (gap §7 in docs/admin/07-open-questions-gaps.md), not
 * "unbuilt" — the enforcement mechanism itself is done.
 */
export function requireAdminAuth(req: AdminAuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiHttpError(401, "unauthorized", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAdminAccessToken(token);
    req.adminUserId = payload.sub;
    req.adminEmail = payload.email;
    req.adminRole = payload.role;
    next();
  } catch {
    throw new ApiHttpError(401, "unauthorized", "Invalid or expired admin access token");
  }
}
