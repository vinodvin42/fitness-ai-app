import { z } from "zod";

// Login with authenticator-app MFA (Oct 2026); no signup, SSO, or password-reset endpoint. AdminUser
// accounts are provisioned by seeding/a future Admin Users screen (see
// docs/admin/03-screen-inventory.md 12.01), never self-service, matching
// docs/admin/07-open-questions-gaps.md's "no auth screens in Figma ->
// build plain functional auth" resolution (the same call already made for
// the mobile app's original phone+OTP-to-email/password substitution).
export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Blueprint section 5: admins sign in with email + password + the
  // 6-digit code from an authenticator app (no OTP). A single-use
  // recovery code can stand in for the code.
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code").optional(),
  recoveryCode: z.string().trim().min(6).max(32).optional(),
});

export const adminMfaSetupSchema = z.object({
  setupToken: z.string().min(1),
});

export const adminMfaConfirmSchema = z.object({
  setupToken: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export type AdminMfaConfirmInput = z.infer<typeof adminMfaConfirmSchema>;

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// Go-live hardening (25 Aug 2026) — added specifically because there was
// no way for an admin to rotate their own password at all: scripts/seed.ts
// bootstraps the first super_admin from SEED_ADMIN_PASSWORD (falling back
// to a dev-only default that's published in this repo's own
// RUN-LOCALLY.md), and until this endpoint existed, that credential could
// only ever be changed by editing the database directly. Mirrors
// users.schema.ts's changePasswordSchema exactly.
export const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72), // 72: bcrypt's own effective input limit
});

export type AdminChangePasswordInput = z.infer<typeof adminChangePasswordSchema>;
