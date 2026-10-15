import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Admin console (Phase 6, 20 Aug 2026) — deliberately its own token
 * type/secret, mirroring lib/jwt.ts's shape but never interchangeable with
 * a consumer access token. See prisma/schema.prisma's AdminUser doc
 * comment for why this is a fully separate identity, not a `role` flag on
 * the consumer `User`.
 */
export interface AdminAccessTokenPayload {
  sub: string; // AdminUser id
  email: string;
  role: string;
}

export function signAdminAccessToken(payload: AdminAccessTokenPayload): { token: string; expiresAt: number } {
  const expiresInSeconds = env.ADMIN_JWT_ACCESS_TTL_MIN * 60;
  const token = jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn: expiresInSeconds });
  return { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload {
  const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminAccessTokenPayload & { purpose?: string };
  // A short-lived MFA set-up token (below) is signed with the same secret
  // but is never a session: refuse it everywhere a session is expected.
  if (payload.purpose) {
    throw new Error("Not an admin session token");
  }
  return payload;
}

/**
 * Admin MFA set-up (blueprint section 5): after a correct password, an
 * admin who has not yet set up an authenticator app gets this 10-minute
 * token instead of a session. It only works on /admin/auth/mfa/setup and
 * /admin/auth/mfa/confirm.
 */
const MFA_SETUP_PURPOSE = "admin_mfa_setup";
const MFA_SETUP_TTL_SECONDS = 10 * 60;

export function signAdminMfaSetupToken(adminUserId: string): string {
  return jwt.sign({ sub: adminUserId, purpose: MFA_SETUP_PURPOSE }, env.ADMIN_JWT_SECRET, { expiresIn: MFA_SETUP_TTL_SECONDS });
}

/** Returns the admin id, or throws when the token is not a valid, unexpired set-up token. */
export function verifyAdminMfaSetupToken(token: string): string {
  const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as { sub?: string; purpose?: string };
  if (payload.purpose !== MFA_SETUP_PURPOSE || !payload.sub) {
    throw new Error("Not an MFA set-up token");
  }
  return payload.sub;
}
