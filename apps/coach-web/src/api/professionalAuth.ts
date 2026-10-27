import type {
  Professional,
  ProfessionalAuthResponse,
  ProfessionalLoginInput,
  ProfessionalMeResponse,
  ProfessionalSignupInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function signupRequest(input: ProfessionalSignupInput) {
  return apiClient.post<ProfessionalAuthResponse>("/professionals/auth/signup", input).then((r) => r.data);
}

export function loginRequest(input: ProfessionalLoginInput) {
  return apiClient.post<ProfessionalAuthResponse>("/professionals/auth/login", input).then((r) => r.data);
}

export function logoutRequest(refreshToken: string) {
  return apiClient.post("/professionals/auth/logout", { refreshToken });
}

/** Coach gender (20 Oct 2026): states the coach's own gender, or clears it with null. */
export function setMyGender(gender: "male" | "female" | null) {
  return apiClient.patch<{ gender: "male" | "female" | null }>("/professionals/me/gender", { gender }).then((r) => r.data);
}

/** Languages (25 Oct 2026): the ISO 639-1 codes you coach in; an empty list clears them. */
export function setMyLanguages(languages: string[]) {
  return apiClient.patch<{ languages: string[] }>("/professionals/me/languages", { languages }).then((r) => r.data);
}

/** About you (27 Oct 2026): years of experience, bio and specialties. Send only the fields that changed. */
export interface MyProfileInput {
  bio?: string | null;
  yearsExperience?: number | null;
  specializationTags?: string[];
}

export function setMyProfile(input: MyProfileInput) {
  return apiClient.patch<{ professional: Professional }>("/professionals/me/profile", input).then((r) => r.data);
}

export function fetchMe() {
  return apiClient.get<ProfessionalMeResponse>("/professionals/me").then((r) => r.data);
}
