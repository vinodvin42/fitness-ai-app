import { z } from "zod";

// Mirrors docs/mobile/02-information-architecture.md §1 onboarding wizard:
// About You -> Schedule -> Goals -> Training level -> Equipment -> Food/diet
// -> Safety/injuries. `trainingDaysPerWeek`/`preferredTrainingDays`/
// `sessionLengthMinutes` and `equipmentContext` map straight onto
// OnboardingProfile's own columns (see schema.prisma's own comments there).
// `bodyFatPercent`/`waistCm`/`hipsCm` are NOT OnboardingProfile columns —
// they're the wizard's new baseline-measurements step, and
// users.service.ts#upsertOnboardingProfile writes them into a real
// BodyMeasurement row instead (see that function's own comment for why).
const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const EQUIPMENT_CONTEXTS = [
  "full_gym",
  "home_dumbbells_bands",
  "home_bodyweight_only",
  "none_travel",
] as const;

export const onboardingProfileSchema = z.object({
  gender: z.string().optional(),
  age: z.number().int().positive().max(120).optional(),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  goals: z.array(z.string()).default([]),
  trainingLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  dietType: z.string().optional(),
  allergens: z.array(z.string()).default([]),
  medicalConditions: z.array(z.string()).default([]),
  injuries: z.array(z.string()).default([]),
  // Availability/Schedule (18 Sep 2026) — see schema.prisma's own comment.
  trainingDaysPerWeek: z.number().int().min(1).max(7).optional(),
  preferredTrainingDays: z.array(z.enum(DAYS_OF_WEEK)).default([]),
  sessionLengthMinutes: z.number().int().min(15).max(180).optional(),
  // Equipment/gym-context self-report (18 Sep 2026) — see schema.prisma's
  // own comment; wired into plans.service.ts#buildSelectionPrompt.
  equipmentContext: z.enum(EQUIPMENT_CONTEXTS).optional(),
  // Broader Baseline/measurements (18 Sep 2026) — clearly optional; most
  // users won't have a precise body-fat% reading. See this file's top
  // comment and users.service.ts#upsertOnboardingProfile.
  bodyFatPercent: z.number().positive().max(70).optional(),
  waistCm: z.number().positive().max(300).optional(),
  hipsCm: z.number().positive().max(300).optional(),
});

export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;

// docs/mobile/03-screen-inventory.md §N: View/Edit Profile (name/phone) +
// Preferences (unit system, accent color) + §L: Language Selection
// (languagePreference — the field already existed, only the mobile
// screen to set it was missing until Phase 4) and Notification Settings'
// master toggle (notificationsEnabled, added 19 Aug 2026). Real i18n
// (actually translating the app's UI) isn't built — languagePreference
// persists and round-trips like accentColor, without live-retheming/
// re-stringing the app yet (same simplification as gap §11).
// **26 Aug 2026: `countryCode` added** — the decision behind Module
// 09.05's "needs a region-capture-method decision" gap. Captured here, on
// Edit Profile, as an explicit user choice (a curated-country picker with
// a raw-code fallback for anyone not in that curated list — see
// EditProfileScreen.tsx) rather than inferred from `phone`: phone isn't
// required at signup, has no format validation, and isn't collected
// during onboarding, so parsing a country code out of it would be
// guessing at a fact this build doesn't actually have.
export const updateProfileSchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    phone: z.string().min(1).max(32).optional(),
    languagePreference: z.string().min(2).max(10).optional(),
    unitSystem: z.enum(["metric", "imperial"]).optional(),
    accentColor: z.enum(["blue", "green", "yellow", "red"]).optional(),
    notificationsEnabled: z.boolean().optional(),
    // Module 09.05 Geographic (26 Aug 2026) — ISO 3166-1 alpha-2, uppercase.
    // Format-validated only, not checked against a fixed country list —
    // see schema.prisma's User.countryCode comment for why.
    countryCode: z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code, e.g. US or IN").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// §N "View/Edit Profile" (docs/mobile/03-screen-inventory.md) says "full
// name, date of birth, mobile number, gender, height, weight" — full
// name/phone are already covered by updateProfileSchema above (they live
// on User). The rest — gender/height/weight — live on OnboardingProfile,
// added 19 Aug 2026. There's no real "date of birth" anywhere in this
// schema: onboarding's own "About You" step (§A) only ever collected an
// `age` stepper input, not a birthdate, so this edits `age`, not a DOB —
// see gap §31 for that design/implementation mismatch. Deliberately
// excludes the onboarding-only fields (goals/trainingLevel/dietType/
// allergens/medicalConditions/injuries) — those aren't part of what Edit
// Profile's design asks for, and stay wizard-only for this pass.
export const editOnboardingProfileSchema = z
  .object({
    gender: z.string().optional(),
    age: z.number().int().positive().max(120).optional(),
    weightKg: z.number().positive().optional(),
    heightCm: z.number().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export type EditOnboardingProfileInput = z.infer<typeof editOnboardingProfileSchema>;

// §L "Security" (docs/mobile/03-screen-inventory.md) — real password
// change, reusing the same bcrypt lib as signup/login. Changing the
// password revokes every active RefreshToken for this user (all devices,
// including the one making this request) — a deliberate, standard
// security behavior, not an oversight; see users.service.ts.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72), // 72: bcrypt's own effective input limit
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// §L "Security" / "Data & Privacy" (folded into one screen — see
// SecurityScreen.tsx's own doc comment) — a real hard delete, requiring
// the current password as confirmation. Cascades via Prisma's onDelete:
// Cascade on every user-owned model except AuditLog (onDelete: SetNull,
// so the audit trail survives with an anonymized actor).
export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17). Setup
// takes no body (see users.routes.ts's POST /users/me/2fa/setup) — enable
// just needs the 6-digit code from the freshly-scanned authenticator app,
// proving the user actually finished enrollment before the flag flips on.
export const enableTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});
export type EnableTwoFactorInput = z.infer<typeof enableTwoFactorSchema>;

// Same "re-enter your password to confirm a security-sensitive change"
// pattern as deleteAccountSchema above — turning 2FA off is exactly that.
export const disableTwoFactorSchema = z.object({
  password: z.string().min(1),
});
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;

// §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — see
// prisma/schema.prisma's `Consent` model doc comment for the full
// reasoning behind this exact three-value set. Kept in sync with
// `ConsentType` there — Prisma's own enum is the source of truth, this is
// just the request-validation mirror every other enum field in this file
// (e.g. `trainingLevel` above) already keeps.
export const consentTypes = ["marketing_emails", "data_analytics", "health_data_processing"] as const;

export const updateConsentSchema = z.object({
  type: z.enum(consentTypes),
  granted: z.boolean(),
});
export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;
