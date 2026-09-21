import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Creator Portal (R2 Wave 5, 21 Sep 2026) — mirrors lib/professionalJwt.ts
 * exactly, for the separate `Influencer` identity. Own secret, own token
 * type, never interchangeable with a consumer/admin/professional token —
 * see prisma/schema.prisma's `Influencer` model comment.
 */
export interface InfluencerAccessTokenPayload {
  sub: string; // Influencer id
  email: string;
}

export function signInfluencerAccessToken(
  payload: InfluencerAccessTokenPayload,
): { token: string; expiresAt: number } {
  const expiresInSeconds = env.INFLUENCER_JWT_ACCESS_TTL_MIN * 60;
  const token = jwt.sign(payload, env.INFLUENCER_JWT_SECRET, { expiresIn: expiresInSeconds });
  return { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function verifyInfluencerAccessToken(token: string): InfluencerAccessTokenPayload {
  return jwt.verify(token, env.INFLUENCER_JWT_SECRET) as InfluencerAccessTokenPayload;
}

export function generateInfluencerRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashInfluencerRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function influencerRefreshTokenExpiry(): Date {
  const days = env.INFLUENCER_JWT_REFRESH_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
