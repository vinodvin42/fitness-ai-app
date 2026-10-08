import axios from "axios";
import { apiBaseUrl } from "./env";

const TOKEN_KEY = "fynrox-admin.token";

export const apiClient = axios.create({ baseURL: apiBaseUrl });

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// There's no admin refresh-token flow (see apps/api's config/env.ts,
// ADMIN_JWT_ACCESS_TTL_MIN's doc comment) — a 401 here just means the
// session token is missing/expired, so the only correct move is to clear
// it and let AuthProvider's state drop back to "logged out", which routes
// to /login. This is deliberately simpler than user-mobile's client.ts
// (no silent refresh-and-retry), matching this slice's "plain functional
// auth" scope.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(error);
  },
);
