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
  return jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminAccessTokenPayload;
}
