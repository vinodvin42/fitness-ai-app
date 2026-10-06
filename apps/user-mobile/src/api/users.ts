import type {
  ChangePasswordInput,
  DeleteAccountInput,
  DisableTwoFactorInput,
  EditOnboardingProfileInput,
  EnableTwoFactorInput,
  EnableTwoFactorResponse,
  GuardianReview,
  GuardianReviewInput,
  OnboardingProfile,
  OnboardingProfileInput,
  Session,
  SetupTwoFactorResponse,
  UpdateProfileInput,
  User,
  UserDataExport,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function submitOnboarding(input: OnboardingProfileInput) {
  return apiClient
    .put<{ onboardingProfile: OnboardingProfile }>("/users/me/onboarding", input)
    .then((r) => r.data.onboardingProfile);
}

export function updateProfile(input: UpdateProfileInput) {
  return apiClient.patch<{ user: User }>("/users/me", input).then((r) => r.data.user);
}

/** gender/age/height/weight — backs Edit Profile's onboarding-data fields. */
export function fetchOnboardingProfile() {
  return apiClient
    .get<{ onboardingProfile: OnboardingProfile }>("/users/me/onboarding")
    .then((r) => r.data.onboardingProfile);
}

/** A real partial edit of an already-completed OnboardingProfile — leaves `completedAt` untouched, unlike submitOnboarding's upsert. */
export function editOnboardingProfile(input: EditOnboardingProfileInput) {
  return apiClient
    .patch<{ onboardingProfile: OnboardingProfile }>("/users/me/onboarding", input)
    .then((r) => r.data.onboardingProfile);
}

// §L "Security" (docs/mobile/03-screen-inventory.md) — see SecurityScreen.tsx.

export function changePassword(input: ChangePasswordInput) {
  return apiClient.patch("/users/me/password", input).then(() => undefined);
}

export function fetchSessions() {
  return apiClient.get<{ items: Session[] }>("/users/me/sessions").then((r) => r.data.items);
}

export function revokeSession(id: string) {
  return apiClient.delete(`/users/me/sessions/${id}`).then(() => undefined);
}

export function fetchDataExport() {
  return apiClient.get<UserDataExport>("/users/me/export").then((r) => r.data);
}

export function deleteAccount(input: DeleteAccountInput) {
  return apiClient.delete("/users/me", { data: input }).then(() => undefined);
}

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17). See SecurityScreen.tsx.

export function setupTwoFactor() {
  return apiClient.post<SetupTwoFactorResponse>("/users/me/2fa/setup").then((r) => r.data);
}

export function enableTwoFactor(input: EnableTwoFactorInput) {
  return apiClient.post<EnableTwoFactorResponse>("/users/me/2fa/enable", input).then((r) => r.data);
}

export function disableTwoFactor(input: DisableTwoFactorInput) {
  return apiClient.post("/users/me/2fa/disable", input).then(() => undefined);
}

// Under-18 guardian review (onboarding/11) — apps/api POST/GET /users/me/guardian-review.
export function submitGuardianReview(input: GuardianReviewInput) {
  return apiClient.post<{ guardianReview: GuardianReview }>("/users/me/guardian-review", input).then((r) => r.data.guardianReview);
}

/** Null when no review was ever submitted. */
export function fetchGuardianReview() {
  return apiClient.get<{ guardianReview: GuardianReview | null }>("/users/me/guardian-review").then((r) => r.data.guardianReview);
}
