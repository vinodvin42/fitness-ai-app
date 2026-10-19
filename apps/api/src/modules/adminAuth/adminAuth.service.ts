import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAdminAccessToken, signAdminMfaSetupToken, verifyAdminMfaSetupToken } from "../../lib/adminJwt";
import {
  buildOtpauthUrl,
  decryptSecret,
  encryptSecret,
  generateQrCodeDataUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from "../../lib/twoFactor";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  AdminChangePasswordInput,
  AdminForgotPasswordInput,
  AdminLoginInput,
  AdminMfaConfirmInput,
  AdminResetPasswordInput,
} from "./adminAuth.schema";
import { generatePasswordResetToken, hashPasswordResetToken, passwordResetTokenExpiry } from "../../lib/jwt";
import { isEmailConfigured, sendEmail } from "../../lib/mailer";
import { BRAND_NAME } from "@fitness-ai-app/config";

/**
 * Admin console auth (Phase 6, 20 Aug 2026; authenticator-app MFA added
 * Oct 2026 per the FynroX blueprint). No signup/SSO/password-reset (see adminAuth.schema.ts's
 * doc comment) and no refresh-token rotation (see config/env.ts's
 * ADMIN_JWT_ACCESS_TTL_MIN comment). AdminUser accounts are provisioned by
 * scripts/seed.ts for now; a real Admin Users management screen
 * (docs/admin/03-screen-inventory.md 12.01) is still unbuilt.
 *
 * Deliberately does NOT import `AdminUser` as a Prisma model type (same
 * reasoning as users.service.ts's toPublicUser — see that file's own
 * history / docs/platform/mvp-launch-plan.md §2: `prisma generate` can't
 * run in this build sandbox, so named model type imports from
 * "@prisma/client" fail to resolve here even though `prisma.<model>.*`
 * calls themselves still typecheck fine against the client's `any`-typed
 * stub).
*/

/** Never return passwordHash to a client — mirrors users.service.ts's toPublicUser boundary. */
export function toPublicAdminUser(adminUser: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
  mfaSecret?: string | null;
  mfaRecoveryCodes?: string[];
  mfaLastCode?: string | null;
  mfaEnabled?: boolean;
}) {
  // Never return the password hash or the MFA secret / recovery codes.
  const {
    passwordHash: _passwordHash,
    mfaSecret: _mfaSecret,
    mfaRecoveryCodes: _mfaRecoveryCodes,
    mfaLastCode: _mfaLastCode,
    ...publicAdminUser
  } = adminUser;
  return publicAdminUser;
}

/**
 * Admin MFA is required (blueprint section 5: email + password + an
 * authenticator code). The only exceptions: the automated test suite
 * (NODE_ENV=test, so existing fixtures can sign in), and a developer's own
 * machine may switch it off with ADMIN_MFA_REQUIRED=false — never in
 * production. Read at call time.
 */
export function isAdminMfaRequired(): boolean {
  const flag = process.env.ADMIN_MFA_REQUIRED;
  if (env.NODE_ENV === "production") return true;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env.NODE_ENV !== "test";
}

/** A TOTP code may be used once: the same code is refused for this long after it worked. */
const TOTP_REUSE_WINDOW_MS = 2 * 60 * 1000;

type AdminRowForMfa = {
  id: string;
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
  mfaRecoveryCodes?: string[];
  mfaLastCode?: string | null;
  mfaLastCodeAt?: Date | null;
};

/** Checks a 6-digit code, or burns one recovery code. Throws 401 when neither is right. */
async function verifyAdminSecondFactor(adminUser: AdminRowForMfa, input: { code?: string; recoveryCode?: string }) {
  if (!input.code && !input.recoveryCode) {
    throw new ApiHttpError(401, "mfa_required", "Enter the 6-digit code from your authenticator app");
  }
  if (input.code && adminUser.mfaSecret) {
    const reused =
      adminUser.mfaLastCode === input.code &&
      !!adminUser.mfaLastCodeAt &&
      Date.now() - adminUser.mfaLastCodeAt.getTime() < TOTP_REUSE_WINDOW_MS;
    if (!reused && (await verifyTotpCode(decryptSecret(adminUser.mfaSecret), input.code))) {
      // Remember the code so an intercepted code can't be replayed. The
      // conditional write also stops two simultaneous sign-ins with one code.
      const claimed = await prisma.adminUser.updateMany({
        where: {
          id: adminUser.id,
          OR: [{ mfaLastCode: null }, { mfaLastCode: { not: input.code } }, { mfaLastCodeAt: { lt: new Date(Date.now() - TOTP_REUSE_WINDOW_MS) } }],
        },
        data: { mfaLastCode: input.code, mfaLastCodeAt: new Date() },
      });
      if (claimed.count === 1) return;
    }
  }
  if (input.recoveryCode) {
    const normalised = input.recoveryCode.replace(/[\s-]/g, "").toUpperCase();
    const hashes = adminUser.mfaRecoveryCodes ?? [];
    for (let i = 0; i < hashes.length; i++) {
      if (await verifyPassword(normalised, hashes[i])) {
        // Conditional write: if two sign-ins race with the same code, only
        // the one that still finds the code in the list wins.
        const used = await prisma.adminUser.updateMany({
          where: { id: adminUser.id, mfaRecoveryCodes: { has: hashes[i] } },
          data: { mfaRecoveryCodes: hashes.filter((_, index) => index !== i) },
        });
        if (used.count === 0) break;
        await recordAudit({
          actorAdminId: adminUser.id,
          action: "admin_user.mfa_recovery_code_used",
          entityType: "AdminUser",
          entityId: adminUser.id,
          metadata: { remaining: hashes.length - 1 },
        });
        return;
      }
    }
  }
  throw new ApiHttpError(401, "invalid_mfa_code", "That code is not right. Check your authenticator app and try again.");
}

export async function adminLogin(input: AdminLoginInput) {
  const adminUser = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (!adminUser) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  if (adminUser.status !== "active") {
    // Deliberately the same generic message as a bad password — don't leak
    // account-existence/status to an unauthenticated caller.
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const valid = await verifyPassword(input.password, adminUser.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  // Second factor: an authenticator app (blueprint section 5).
  if (adminUser.mfaEnabled) {
    await verifyAdminSecondFactor(adminUser, input);
  } else if (isAdminMfaRequired()) {
    return { mfaSetupRequired: true as const, setupToken: signAdminMfaSetupToken(adminUser.id) };
  }

  return startAdminSession(adminUser.id, adminUser.email, adminUser.role);
}

async function startAdminSession(adminUserId: string, email: string, role: string) {
  const updated = await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { lastLoginAt: new Date() },
  });

  await recordAudit({
    actorAdminId: adminUserId,
    action: "admin_user.login",
    entityType: "AdminUser",
    entityId: adminUserId,
  });

  const access = signAdminAccessToken({ sub: adminUserId, email, role });

  return { mfaSetupRequired: false as const, adminUser: updated, token: access.token, tokenExpiresAt: access.expiresAt };
}

function adminIdFromSetupToken(setupToken: string): string {
  try {
    return verifyAdminMfaSetupToken(setupToken);
  } catch {
    throw new ApiHttpError(401, "mfa_setup_expired", "Your set-up session expired. Sign in again.");
  }
}

/** Step 1 of MFA set-up: creates a fresh secret and returns the QR code to scan. */
export async function startAdminMfaSetup(setupToken: string) {
  const adminUser = await getAdminUserById(adminIdFromSetupToken(setupToken));
  if (adminUser.status !== "active") {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }
  if (adminUser.mfaEnabled) {
    throw new ApiHttpError(409, "mfa_already_enabled", "An authenticator app is already set up for this account");
  }
  const secret = generateTotpSecret();
  await prisma.adminUser.update({ where: { id: adminUser.id }, data: { mfaSecret: encryptSecret(secret) } });
  const otpauthUrl = buildOtpauthUrl(adminUser.email, secret);
  return { otpauthUrl, qrCodeDataUrl: await generateQrCodeDataUrl(otpauthUrl), secret };
}

/** Step 2 of MFA set-up: a real code turns MFA on, returns recovery codes once, and starts the session. */
export async function confirmAdminMfaSetup(input: AdminMfaConfirmInput) {
  const adminUser = await getAdminUserById(adminIdFromSetupToken(input.setupToken));
  if (adminUser.status !== "active") {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }
  if (adminUser.mfaEnabled) {
    throw new ApiHttpError(409, "mfa_already_enabled", "An authenticator app is already set up for this account");
  }
  if (!adminUser.mfaSecret || !(await verifyTotpCode(decryptSecret(adminUser.mfaSecret), input.code))) {
    throw new ApiHttpError(401, "invalid_mfa_code", "That code is not right. Check your authenticator app and try again.");
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = await Promise.all(recoveryCodes.map((code) => hashPassword(code)));
  await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { mfaEnabled: true, mfaEnabledAt: new Date(), mfaRecoveryCodes: hashed },
  });
  await recordAudit({
    actorAdminId: adminUser.id,
    action: "admin_user.mfa_enabled",
    entityType: "AdminUser",
    entityId: adminUser.id,
  });

  const session = await startAdminSession(adminUser.id, adminUser.email, adminUser.role);
  return { ...session, recoveryCodes };
}

/**
 * Super Admin resets another admin's authenticator (lost phone). The admin
 * sets it up again at their next sign-in. Anyone else's reset is an
 * approval request (requirePermission on the route).
 */
export async function resetAdminMfa(actorAdminId: string, targetAdminId: string) {
  const target = await getAdminUserById(targetAdminId);
  await prisma.adminUser.update({
    where: { id: target.id },
    data: { mfaEnabled: false, mfaEnabledAt: null, mfaSecret: null, mfaRecoveryCodes: [], mfaLastCode: null, mfaLastCodeAt: null },
  });
  await recordAudit({
    actorAdminId,
    action: "admin_user.mfa_reset",
    entityType: "AdminUser",
    entityId: target.id,
    stateBefore: { mfaEnabled: target.mfaEnabled },
    stateAfter: { mfaEnabled: false },
  });
  return toPublicAdminUser(await getAdminUserById(target.id));
}

export async function getAdminUserById(id: string) {
  const adminUser = await prisma.adminUser.findUnique({ where: { id } });
  if (!adminUser) {
    throw new ApiHttpError(404, "not_found", "Admin user not found");
  }
  return adminUser;
}

/**
 * Go-live hardening (25 Aug 2026) — closes the gap scripts/seed.ts's own
 * comment flagged: before this, an AdminUser's password could only be
 * rotated by editing the database directly, which meant the seeded
 * bootstrap credential (published in this repo's own RUN-LOCALLY.md) had
 * no real path off a fresh deploy. Mirrors users.service.ts's
 * changePassword — verify current password, hash and store the new one,
 * audit the action — minus that function's refresh-token revocation step,
 * since admin sessions have no refresh flow to revoke (see
 * adminAuth.service.ts's own module doc comment).
 */
export async function changeAdminPassword(adminUserId: string, input: AdminChangePasswordInput) {
  const adminUser = await getAdminUserById(adminUserId);

  const valid = await verifyPassword(input.currentPassword, adminUser.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "incorrect_password", "Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { passwordHash } });

  await recordAudit({
    actorAdminId: adminUserId,
    action: "admin_user.password_changed",
    entityType: "AdminUser",
    entityId: adminUserId,
  });
}

// ---------------------------------------------------------------------------
// Admin forgot/reset password (Oct 2026). Mirrors the app's flow
// (auth.service.ts forgotPassword/resetPassword): a random token, only its
// hash stored, 30 minutes, one use. The reply never says whether an account
// exists. Only active admins get a link. Resetting the password does not skip
// the sign-in code: an admin with MFA still needs it, and a lost authenticator
// is reset by a Super Admin (Admin Users → Reset sign-in code).
// The link needs ADMIN_WEB_URL (where the console is served) and SMTP.
// ---------------------------------------------------------------------------

export function isAdminResetEmailConfigured(): boolean {
  return isEmailConfigured() && Boolean(env.ADMIN_WEB_URL);
}

export async function requestAdminPasswordReset(input: AdminForgotPasswordInput): Promise<{ emailSent: boolean }> {
  const emailReady = isAdminResetEmailConfigured();
  const admin = await prisma.adminUser.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } } });
  if (!admin || admin.status !== "active") return { emailSent: emailReady };

  const rawToken = generatePasswordResetToken();
  await prisma.adminPasswordResetToken.create({
    data: { adminUserId: admin.id, tokenHash: hashPasswordResetToken(rawToken), expiresAt: passwordResetTokenExpiry() },
  });
  await recordAudit({ actorAdminId: admin.id, action: "admin.password_reset_requested", entityType: "AdminUser", entityId: admin.id });
  if (!emailReady) return { emailSent: false };

  const link = `${env.ADMIN_WEB_URL!.replace(/\/+$/, "")}/reset-password?token=${rawToken}`;
  try {
    await sendEmail({
      to: admin.email,
      subject: `Reset your ${BRAND_NAME} admin password`,
      text: [
        `We received a request to reset the password for your ${BRAND_NAME} admin account.`,
        ``,
        `Reset it here: ${link}`,
        ``,
        `This link expires in 30 minutes and works once. You'll still need your sign-in code after resetting.`,
        `If you didn't ask for this, ignore this email: your password hasn't changed.`,
      ].join("\n"),
    });
    return { emailSent: true };
  } catch {
    return { emailSent: false };
  }
}

export async function resetAdminPassword(input: AdminResetPasswordInput): Promise<void> {
  const record = await prisma.adminPasswordResetToken.findUnique({ where: { tokenHash: hashPasswordResetToken(input.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiHttpError(400, "invalid_reset_token", "This reset link is invalid or has expired");
  }
  const admin = await prisma.adminUser.findUnique({ where: { id: record.adminUserId }, select: { id: true, status: true } });
  if (!admin || admin.status !== "active") {
    throw new ApiHttpError(400, "invalid_reset_token", "This reset link is invalid or has expired");
  }
  // Claim-once, so two tabs can't both use the same link.
  const claimed = await prisma.adminPasswordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw new ApiHttpError(409, "reset_token_already_used", "This reset link has already been used");

  await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  // Any other outstanding links for this admin stop working too.
  await prisma.adminPasswordResetToken.updateMany({ where: { adminUserId: admin.id, usedAt: null }, data: { usedAt: new Date() } });
  await recordAudit({ actorAdminId: admin.id, action: "admin.password_reset_completed", entityType: "AdminUser", entityId: admin.id });
}
