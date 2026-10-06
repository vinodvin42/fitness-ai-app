/**
 * Age helpers. `OnboardingProfile.dateOfBirth` (Figma onboarding 04) is the
 * source of truth when present; the legacy `age` integer is only used for
 * rows/clients that never supplied a date of birth.
 */

/** Parses a strict YYYY-MM-DD string to a UTC-midnight Date, or null if it is not a real calendar date. */
export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** Whole years between `dob` and `now` (UTC calendar dates). */
export function ageFromDateOfBirth(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Prefers the DOB-derived age; falls back to the legacy stored `age`. */
export function effectiveAge(profile: { dateOfBirth?: Date | null; age?: number | null }, now: Date = new Date()): number | null {
  if (profile.dateOfBirth) return ageFromDateOfBirth(profile.dateOfBirth, now);
  return profile.age ?? null;
}
