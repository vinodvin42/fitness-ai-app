import { prisma } from "../db/prisma";
import { ApiHttpError } from "../middleware/errorHandler";
import { ageFromDateOfBirth } from "./age";

/**
 * Server-side enforcement of the Figma "Guardian review is required" gate
 * (onboarding 11): while a minor's guardian authorization is not verified,
 * no health questions, fitness profiling, personalized plans or analysis may
 * run. Throws 403 with a stable machine-readable code:
 *   - guardian_authorization_pending  — a review exists and is still pending
 *   - guardian_authorization_declined — the guardian declined
 *   - guardian_authorization_required — profile DOB says under 18 and no review exists
 * Legacy minors with only an integer `age` (no DOB, no review) are not
 * blocked here — there is no verifiable signal to gate on.
 */
export async function assertGuardianCleared(userId: string, opts: { dateOfBirth?: Date | null } = {}): Promise<void> {
  const review = await prisma.guardianReview.findUnique({ where: { userId }, select: { status: true } });
  if (review) {
    if (review.status === "approved") return;
    if (review.status === "declined") {
      throw new ApiHttpError(403, "guardian_authorization_declined", "Your guardian declined authorization, so this feature is unavailable.");
    }
    throw new ApiHttpError(403, "guardian_authorization_pending", "Guardian authorization is pending, so this feature is unavailable until it is verified.");
  }
  const profile = opts.dateOfBirth ? null : await prisma.onboardingProfile.findUnique({ where: { userId }, select: { dateOfBirth: true } });
  const dob = opts.dateOfBirth ?? profile?.dateOfBirth ?? null;
  if (dob && ageFromDateOfBirth(dob) < 18) {
    throw new ApiHttpError(403, "guardian_authorization_required", "Guardian authorization is required before this feature can be used.");
  }
}
