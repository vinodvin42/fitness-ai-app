import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { ProfessionalAccessTokenPayload, verifyProfessionalAccessToken } from "../lib/professionalJwt";
import { ApiHttpError } from "./errorHandler";

export interface ProfessionalAuthedRequest extends Request {
  professionalId?: string;
  professionalEmail?: string;
}

/**
 * Coach marketplace (Phase 5) equivalent of middleware/auth.ts's requireAuth — verifies a Professional Bearer token.
 *
 * 20 Oct 2026 (coach communication audit B1): it also reads the
 * professional's CURRENT status, the same way adminPermissions.ts's
 * currentRole() re-checks an admin. A coach suspended after a safety report
 * loses access on the next request, not when the access token expires up to
 * 15 minutes later, so they can't keep messaging clients or reading their
 * data. The cost is one primary-key lookup per coach request. Coach traffic
 * is small next to consumer traffic, and the polls behind it (the thread
 * every 8s, the conversation list every 15s) already run several queries
 * each. The 401 makes the coach app try a refresh, which suspension has
 * revoked, so the app clears its tokens.
 */
export function requireProfessionalAuth(req: ProfessionalAuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiHttpError(401, "unauthorized", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  let payload: ProfessionalAccessTokenPayload;
  try {
    payload = verifyProfessionalAccessToken(token);
  } catch {
    throw new ApiHttpError(401, "unauthorized", "Invalid or expired professional access token");
  }

  (async () => {
    const professional = await prisma.professional.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!professional) {
      throw new ApiHttpError(401, "unauthorized", "Invalid or expired professional access token");
    }
    if (professional.status !== "active") {
      throw new ApiHttpError(401, "account_suspended", "This account is suspended");
    }

    req.professionalId = payload.sub;
    req.professionalEmail = payload.email;
    next();
  })().catch(next);
}
