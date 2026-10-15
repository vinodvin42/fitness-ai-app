import { prisma } from "../db/prisma";
import { ApiHttpError } from "../middleware/errorHandler";
import { ageFromDateOfBirth } from "./age";

/**
 * FynroX is for adults 18+ only (owner decision, Oct 2026 — replaces the
 * old under-18 guardian review). There is no guardian or parental-consent
 * flow anywhere: an under-18 date of birth is rejected at onboarding, and
 * this gate is a second line of defence for any legacy account whose stored
 * age is under 18.
 */
export const MINIMUM_AGE = 18;

export const UNDER_18_CODE = "under_18_not_allowed";
export const UNDER_18_MESSAGE = "FynroX is for adults 18 and over.";

/** Throws 422 when the supplied date of birth or age is under 18. */
export function assertAdultAge(input: { dateOfBirth?: Date | null; age?: number | null }): void {
  const age = input.dateOfBirth ? ageFromDateOfBirth(input.dateOfBirth) : input.age ?? null;
  if (age != null && age < MINIMUM_AGE) {
    throw new ApiHttpError(422, UNDER_18_CODE, UNDER_18_MESSAGE);
  }
}

/** Throws 403 when the user's stored profile says they are under 18. */
export async function assertAdultUser(userId: string): Promise<void> {
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { dateOfBirth: true, age: true } });
  if (!profile) return;
  const age = profile.dateOfBirth ? ageFromDateOfBirth(profile.dateOfBirth) : profile.age ?? null;
  if (age != null && age < MINIMUM_AGE) {
    throw new ApiHttpError(403, UNDER_18_CODE, UNDER_18_MESSAGE);
  }
}
