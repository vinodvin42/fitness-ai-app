import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  generatePasswordResetToken,
  generateRefreshToken,
  hashPasswordResetToken,
  hashRefreshToken,
  passwordResetTokenExpiry,
  refreshTokenExpiry,
  signAccessToken,
  signTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken,
} from "../../lib/jwt";
import { generateUniqueReferralCode } from "../../lib/referralCode";
import { recordAcquisitionTouchpoint } from "../../lib/acquisition";
import { isEmailConfigured, sendEmail } from "../../lib/mailer";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ForgotPasswordInput, LoginInput, ResetPasswordInput, SignupInput } from "./auth.schema";
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

/** Stores the sign-in device (User-Agent) on a freshly issued session, for Security > Active Sessions. Best-effort. */
export async function recordSessionDevice(rawRefreshToken: string, userAgent: string | undefined): Promise<void> {
  if (!userAgent) return;
  try {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawRefreshToken) },
      data: { userAgent: userAgent.slice(0, 300) },
    });
  } catch (err) {
    console.error("recordSessionDevice failed:", err);
  }
}

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiHttpError(409, "email_taken", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const referralCode = await generateUniqueReferralCode();
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      referralCode,
      // Acquisition-context capture (R1 Developer 1 U1, 14 Sep 2026) —
      // stored as-is, never validated against a real model; see
      // schema.prisma's own comment on this field for why.
      acquisitionContext: input.acquisitionContext ?? null,
    },
  });

  await recordAudit({ actorId: user.id, action: "user.signup", entityType: "User", entityId: user.id });

  if (input.referralCode) {
    await redeemReferralCode(user.id, input.referralCode);
  }

  // Acquisition/commercial attribution (R2 Wave 1, 20 Sep 2026) — best-
  // effort resolution of the raw acquisitionContext string into a real
  // Touchpoint. See lib/acquisition.ts's own doc comment for the
  // resolve-then-fallback shape; a no-op when no context was captured.
  await recordAcquisitionTouchpoint(user.id, input.acquisitionContext);

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

/**
 * Forgot/Reset Password (R1 Developer 1, 18 Sep 2026, gap §53) — the
 * consumer app's account-recovery flow. Deliberately generic-response,
 * same "never reveal account-existence" discipline login()/
 * professionalLogin/adminLogin already establish: this always returns
 * the same shape regardless of whether `input.email` has an account, so
 * an attacker can't use this endpoint to enumerate real emails. A real
 * token IS created (and, if email is configured, sent) when the account
 * exists — but the caller can never distinguish "no such account" from
 * "account exists, email sent" from the response alone.
 *
 * Returns `emailSent: false` (rather than throwing) when SMTP isn't
 * configured — honest about delivery, not a silent no-op and not a fake
 * success. The token is still created either way, so the flow stays
 * testable/usable via a direct POST /auth/reset-password call in a dev
 * environment with no real SMTP relay.
 */
export async function forgotPassword(input: ForgotPasswordInput): Promise<{ emailSent: boolean }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // No account, or a suspended one (same "don't reveal account state to
  // an unauthenticated caller" reasoning login() already applies) — still
  // return the generic success shape, just skip actually creating
  // anything. `emailSent` mirrors isEmailConfigured() rather than being
  // hardcoded `true`: a caller comparing this response against a real
  // account's (below) must see the SAME value in both cases, in every
  // environment — including one with SMTP unconfigured, where a real
  // account's response is honestly `emailSent: false` too. Hardcoding
  // `true` here would itself become a real account-enumeration
  // side-channel the moment SMTP isn't configured (exactly what this
  // whole function exists to prevent) — a nonexistent email would
  // always read `true` while a real one read `false`.
  if (!user || user.status !== "active") {
    return { emailSent: isEmailConfigured() };
  }

  const rawToken = generatePasswordResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt: passwordResetTokenExpiry(),
    },
  });

  await recordAudit({ actorId: user.id, action: "user.password_reset_requested", entityType: "User", entityId: user.id });

  if (!isEmailConfigured()) {
    return { emailSent: false };
  }

  const resetLink = `primefit://reset-password?token=${rawToken}`;
  try {
    await sendEmail({
      to: user.email,
      subject: "Reset your 23PrimeFit password",
      text: [
        `We received a request to reset your 23PrimeFit password.`,
        ``,
        `Reset it here: ${resetLink}`,
        ``,
        `This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password hasn't been changed.`,
      ].join("\n"),
    });
  } catch (err) {
    // A real SMTP-configured relay that then fails to actually deliver
    // (bad credentials, relay downtime, etc.) shouldn't surface as a 500
    // to the caller — the token still exists and the generic-response
    // discipline still applies. Log for operator visibility and report
    // honestly that delivery didn't happen.
    console.error("Failed to send password reset email:", err);
    return { emailSent: false };
  }

  return { emailSent: true };
}

/**
 * Completes a password reset. Looks up the hash of the provided raw
 * token (never the raw value — same as refresh()/hashRefreshToken
 * above), claims it atomically so two concurrent reset attempts with the
 * same token can't both succeed (the same `updateMany`-with-a-filter
 * claim-once pattern payments.service.ts's activatePayment() uses for
 * marking a Payment "paid" exactly once), then sets the new password and
 * revokes every existing refresh token for the account — a password
 * reset is a real security event that should log out every other
 * session, not just the one performing the reset.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashPasswordResetToken(input.token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiHttpError(400, "invalid_reset_token", "This reset link is invalid or has expired");
  }

  // Atomic single-use claim — mirrors activatePayment()'s
  // `updateMany({ where: { ..., status: { not: "paid" } } })` guard: only
  // the call whose `updateMany` actually affects a row gets to proceed,
  // so a token replayed concurrently (e.g. a user double-tapping "Reset"
  // or an attacker racing a guessed/leaked token) can only ever succeed
  // once.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "reset_token_already_used", "This reset link has already been used");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });

  // Same "a password reset logs out every other session" discipline as
  // users.service.ts's changePassword().
  await prisma.refreshToken.updateMany({
    where: { userId: record.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actorId: record.userId,
    action: "user.password_reset_completed",
    entityType: "User",
    entityId: record.userId,
  });
}
