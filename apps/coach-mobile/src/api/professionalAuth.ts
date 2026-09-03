import type {
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

export function fetchMe() {
  return apiClient.get<ProfessionalMeResponse>("/professionals/me").then((r) => r.data);
}
