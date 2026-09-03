import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  signTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken,
} from "../../lib/jwt";
import { generateUniqueReferralCode } from "../../lib/referralCode";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { LoginInput, SignupInput } from "./auth.schema";
import { hasCompletedOnboarding, verifyTwoFactorLoginCode } from "../users/users.service";
import { redeemReferralCode } from "../referrals/referrals.service";

async function issueTokenPair(userId: string, email: string) {
  const access = signAccessToken({ sub: userId, email });
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
  };
}

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiHttpError(409, "email_taken", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const referralCode = await generateUniqueReferralCode();
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, fullName: input.fullName, referralCode },
  });

  await recordAudit({ actorId: user.id, action: "user.signup", entityType: "User", entityId: user.id });

  if (input.referralCode) {
    await redeemReferralCode(user.id, input.referralCode);
  }

  const tokens = await issueTokenPair(user.id, user.email);
  return { user, tokens };
}

/**
 * §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17) turned
 * this from a one-step into a (usually) one-step, sometimes-two-step
 * flow: password verification always happens here, but if the account
 * has 2FA enabled, real tokens are withheld and a short-lived challenge
 * token is returned instead — the caller must then complete
 * verifyTwoFactorLogin below with a code from the same request. This is a
 * genuine breaking change to POST /auth/login's response shape (now a
 * discriminated union — see packages/types' LoginResponse), not additive;
 * every client (apps/user-mobile) had to be updated in the same pass.
 */
export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  // Module 02.01 suspend (added 26 Aug 2026) — same pattern and same
  // deliberately-generic error as professionalLogin/adminLogin: never
  // reveal account-existence/suspension to an unauthenticated caller.
  if (user.status !== "active") {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  if (user.twoFactorEnabled) {
    // Deliberately no audit entry yet — "user.login" is recorded once the
    // second factor actually clears, in verifyTwoFactorLogin below. A
    // correct password alone isn't a completed login when 2FA is on.
    return { twoFactorRequired: true as const, twoFactorToken: signTwoFactorChallengeToken(user.id) };
  }

  await recordAudit({ actorId: user.id, action: "user.login", entityType: "User", entityId: user.id });

  const [tokens, onboardingCompleted] = await Promise.all([
    issueTokenPair(user.id, user.email),
    hasCompletedOnboarding(user.id),
  ]);
  return { twoFactorRequired: false as const, user, tokens, onboardingCompleted };
}

/**
 * Completes a two-factor login started above. The challenge token proves
 * the password step already succeeded for this specific userId within
 * the last 5 minutes (see lib/jwt.ts) — this only has to check the second
 * factor, not re-verify the password.
 */
export async function verifyTwoFactorLogin(twoFactorToken: string, code: string) {
  let userId: string;
  try {
    userId = verifyTwoFactorChallengeToken(twoFactorToken).sub;
  } catch {
    throw new ApiHttpError(401, "invalid_challenge", "This login attempt has expired — log in again");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled) {
    throw new ApiHttpError(401, "invalid_challenge", "This login attempt has expired — log in again");
  }

  const isValid = await verifyTwoFactorLoginCode(user, code);
  if (!isValid) {
    throw new ApiHttpError(401, "invalid_code", "Incorrect code");
  }

  await recordAudit({ actorId: user.id, action: "user.login", entityType: "User", entityId: user.id });

  const [tokens, onboardingCompleted] = await Promise.all([
    issueTokenPair(user.id, user.email),
    hasCompletedOnboarding(user.id),
  ]);
  return { user, tokens, onboardingCompleted };
}

export async function refresh(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new ApiHttpError(401, "invalid_refresh_token", "Refresh token is invalid or expired");
  }

  // Rotate: revoke the used token, issue a new pair. Prevents replay of a
  // stolen-but-already-used refresh token.
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });

  const tokens = await issueTokenPair(record.user.id, record.user.email);
  return { user: record.user, tokens };
}

export async function logout(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
