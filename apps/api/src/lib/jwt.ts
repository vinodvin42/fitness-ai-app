import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): { token: string; expiresAt: number } {
  const expiresInSeconds = env.JWT_ACCESS_TTL_MIN * 60;
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: expiresInSeconds });
  return { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload & { purpose?: string };
  // A real access token never carries a `purpose` claim — only a two-factor
  // challenge token does (see below). Rejecting anything with one here is
  // what stops a challenge token — issued after password verification but
  // BEFORE the second factor is checked — from being replayed as a full
  // session token. Without this guard, a valid signature would be the only
  // check, and both token types share the same secret.
  if (payload.purpose) {
    throw new Error("Not an access token");
  }
  return payload;
}

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17). Issued
// once login() has verified the password but before the second factor is
// checked — short-lived (5 min) and single-purpose, so a leaked or
// abandoned challenge only grants "one attempt to guess a TOTP code
// against this specific known userId," not a real session. Deliberately
// NOT stored in a DB table like RefreshToken: it's meant to be consumed
// within the same short window it's issued in, so statelessness is fine
// here — unlike a refresh token, there's no legitimate reason to revoke
// one individually before it expires.
export interface TwoFactorChallengePayload {
  sub: string; // user id
  purpose: "2fa_challenge";
}

const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;

export function signTwoFactorChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "2fa_challenge" }, env.JWT_ACCESS_SECRET, {
    expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  });
}

export function verifyTwoFactorChallengeToken(token: string): TwoFactorChallengePayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TwoFactorChallengePayload & { purpose?: string };
  if (payload.purpose !== "2fa_challenge") {
    throw new Error("Not a two-factor challenge token");
  }
  return payload;
}

/**
 * Refresh tokens are opaque random strings, not JWTs — only their hash is
 * stored (see RefreshToken.tokenHash in prisma/schema.prisma), so a stolen
 * DB dump doesn't leak usable tokens. The raw value is only ever returned
 * to the client once, at issuance.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(): Date {
  const days = env.JWT_REFRESH_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
