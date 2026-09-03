import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Coach marketplace (Phase 5, 20 Aug 2026) — mirrors lib/jwt.ts exactly,
 * for the `Professional` identity. Own secret, own token type, never
 * interchangeable with a consumer or admin token — see
 * prisma/schema.prisma's `Professional` model comment.
 */
export interface ProfessionalAccessTokenPayload {
  sub: string; // Professional id
  email: string;
}

export function signProfessionalAccessToken(
  payload: ProfessionalAccessTokenPayload,
): { token: string; expiresAt: number } {
  const expiresInSeconds = env.PROFESSIONAL_JWT_ACCESS_TTL_MIN * 60;
  const token = jwt.sign(payload, env.PROFESSIONAL_JWT_SECRET, { expiresIn: expiresInSeconds });
  return { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function verifyProfessionalAccessToken(token: string): ProfessionalAccessTokenPayload {
  return jwt.verify(token, env.PROFESSIONAL_JWT_SECRET) as ProfessionalAccessTokenPayload;
}

export function generateProfessionalRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashProfessionalRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function professionalRefreshTokenExpiry(): Date {
  const days = env.PROFESSIONAL_JWT_REFRESH_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
