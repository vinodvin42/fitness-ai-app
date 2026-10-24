import type {
  ChangePasswordInput,
  DeleteAccountInput,
  DisableTwoFactorInput,
  EditOnboardingProfileInput,
  EnableTwoFactorInput,
  EnableTwoFactorResponse,
  HealthAnswersInput,
  OnboardingProfile,
  OnboardingProfileInput,
  ProfilePhoto,
  Session,
  SetupTwoFactorResponse,
  UpdateProfileInput,
  User,
  UserDataExport,
} from "@fitness-ai-app/types";
import { apiClient, getStoredTokens } from "./client";

export function submitOnboarding(input: OnboardingProfileInput) {
  return apiClient
    .put<{ onboardingProfile: OnboardingProfile }>("/users/me/onboarding", input)
    .then((r) => r.data.onboardingProfile);
}

export function updateProfile(input: UpdateProfileInput) {
  return apiClient.patch<{ user: User }>("/users/me", input).then((r) => r.data.user);
}

/** Profile photo (20 Oct 2026): the member's own picture, or null when none is set. */
export function fetchProfilePhoto() {
  return apiClient.get<{ photo: ProfilePhoto | null }>("/users/me/photo").then((r) => r.data.photo);
}

/** Sets or replaces the profile photo; `imageData` is a JPEG or PNG data URI. */
export function saveProfilePhoto(imageData: string) {
  return apiClient.put<{ photo: ProfilePhoto }>("/users/me/photo", { imageData }).then((r) => r.data.photo);
}

export function deleteProfilePhoto() {
  return apiClient.delete("/users/me/photo").then(() => undefined);
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

/** Health answers after setup (24 Oct 2026). `safetyOutcome` is "pause" when a newly reported condition needs a doctor's check first. */
export function updateHealthAnswers(input: HealthAnswersInput) {
  return apiClient
    .put<{ onboardingProfile: OnboardingProfile; safetyOutcome: "pause" | "warning" | "none" }>("/users/me/onboarding/health", input)
    .then((r) => r.data);
}

// §L "Security" (docs/mobile/03-screen-inventory.md) — see SecurityScreen.tsx.

export function changePassword(input: ChangePasswordInput) {
  return apiClient.patch("/users/me/password", input).then(() => undefined);
}

export async function fetchSessions() {
  // The refresh token identifies THIS device so the API can flag it as current.
  const { refreshToken } = await getStoredTokens();
  return apiClient
    .get<{ items: Session[] }>("/users/me/sessions", { headers: refreshToken ? { "X-Refresh-Token": refreshToken } : {} })
    .then((r) => r.data.items);
}

export async function revokeOtherSessions() {
  const { refreshToken } = await getStoredTokens();
  return apiClient.post<{ revoked: number }>("/users/me/sessions/revoke-others", { refreshToken }).then((r) => r.data);
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

