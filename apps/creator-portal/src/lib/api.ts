import axios from "axios";
import { apiBaseUrl } from "./env";

const ACCESS_TOKEN_KEY = "fynrox-creator.accessToken";
const REFRESH_TOKEN_KEY = "fynrox-creator.refreshToken";

export const apiClient = axios.create({ baseURL: apiBaseUrl });

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Same deliberately simple "a 401 just clears the session, no silent
// refresh-and-retry" shape as apps/admin-web/src/lib/api.ts — a real
// rotating refresh token exists (POST /influencers/auth/refresh, unlike
// admin's single-token session) but this portal doesn't spend effort on a
// background-refresh interceptor for its first slice; AuthProvider's
// bootstrap check on mount is the only place the refresh token gets used
// again (see lib/auth.tsx).
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearTokens();
    }
    return Promise.reject(error);
  },
);
