import axios from "axios";
import { apiBaseUrl } from "./env";

const TOKEN_KEY = "fynrox-gym-portal.token";

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

// No gym-portal refresh-token flow (see apps/api's config/env.ts,
// GYM_JWT_ACCESS_TTL_MIN's doc comment — this identity follows
// ADMIN_JWT_ACCESS_TTL_MIN's precedent, not the Professional one) — a 401
// here just means the session token is missing/expired, so the only
// correct move is to clear it and let AuthProvider's state drop back to
// "logged out", which routes to /login. Copied verbatim from
// apps/admin-web/src/lib/api.ts's own interceptor.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(error);
  },
);
