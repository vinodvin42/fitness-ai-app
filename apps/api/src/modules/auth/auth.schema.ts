import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1).max(120),
  // §O "Refer & Invite" — someone else's `User.referralCode`, entered at
  // signup. Optional; an unrecognized code is silently ignored rather
  // than failing the signup (see referrals.service.ts's redeemReferralCode).
  referralCode: z.string().trim().min(1).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17). `code`
// deliberately isn't length/pattern-constrained to "6 digits" here the
// way users.schema.ts's enableTwoFactorSchema is — this endpoint accepts
// EITHER a live TOTP code OR a recovery code (see
// users.service.ts's verifyTwoFactorLoginCode), and the two have
// different shapes. Loose bounds only, real validation happens there.
export const verifyTwoFactorLoginSchema = z.object({
  twoFactorToken: z.string().min(1),
  code: z.string().min(6).max(20),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyTwoFactorLoginInput = z.infer<typeof verifyTwoFactorLoginSchema>;
