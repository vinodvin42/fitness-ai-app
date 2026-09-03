import type {
  AuthResponse,
  LoginInput,
  LoginResponse,
  MeResponse,
  SignupInput,
  VerifyTwoFactorLoginInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function signupRequest(input: SignupInput) {
  return apiClient.post<AuthResponse>("/auth/signup", input).then((r) => r.data);
}

/** §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17) made this a discriminated union — see AuthContext.tsx's login() for how the two branches are handled. */
export function loginRequest(input: LoginInput) {
  return apiClient.post<LoginResponse>("/auth/login", input).then((r) => r.data);
}

/** Completes a two-factor login started by loginRequest above — `code` is either a live authenticator-app code or a recovery code. */
export function verifyTwoFactorLoginRequest(input: VerifyTwoFactorLoginInput) {
  return apiClient.post<AuthResponse>("/auth/2fa/verify", input).then((r) => r.data);
}

export function logoutRequest(refreshToken: string) {
  return apiClient.post("/auth/logout", { refreshToken });
}

export function fetchMe() {
  return apiClient.get<MeResponse>("/users/me").then((r) => r.data);
}
