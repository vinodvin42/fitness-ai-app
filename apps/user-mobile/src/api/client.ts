import axios from "axios";
import Constants from "expo-constants";
import * as SecureStore from "../lib/secureStore";

const ACCESS_TOKEN_KEY = "fynrox.accessToken";
const REFRESH_TOKEN_KEY = "fynrox.refreshToken";

// Go-live hardening (25 Aug 2026) — EXPO_PUBLIC_API_BASE_URL is a build-time
// env var Expo inlines automatically (no app.config changes needed), so a
// production web build can point at the real deployed API without hand-
// editing app.json before every build. Falls back to app.json's
// extra.apiBaseUrl (unchanged local-dev path), then localhost.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:4000";

export const apiClient = axios.create({ baseURL: apiBaseUrl });

export async function getStoredTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function storeTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

// Attach the access token to every request.
apiClient.interceptors.request.use(async (config) => {
  const { accessToken } = await getStoredTokens();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// On a 401, try exactly one silent refresh-and-retry. If that also fails,
// clear tokens and let the caller's error handling (AuthContext) redirect
// to the Auth stack — this interceptor does not own navigation.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await getStoredTokens();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refreshToken });
    await storeTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return data.tokens.accessToken as string;
  } catch {
    await clearTokens();
    return null;
  }
}

// Automatic retry for genuine network-level failures (offline, DNS failure,
// timeout — anything where no response was ever received at all, i.e.
// `!error.response`). Deliberately GET-only: retrying a POST/PATCH/DELETE
// after a network failure risks duplicating a side effect (double-logging a
// set, double-submitting a purchase) if the original request actually did
// reach the server and only the response was lost, so those are left to
// fail once and surface a real error instead. This is separate from React
// Query's own `retry: 1` default (App.tsx) — that only covers reads made
// through `useQuery`; it doesn't help axios calls made outside of React
// Query (e.g. AuthContext's launch-time token check), and this interceptor
// is the one place that GET-vs-mutation safety rule is actually enforced.
const MAX_NETWORK_RETRIES = 2;
const NETWORK_RETRY_DELAY_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshInFlight = refreshInFlight ?? refreshAccessToken();
      const newAccessToken = await refreshInFlight;
      refreshInFlight = null;

      if (newAccessToken) {
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }
    }

    if (!error.response && original && original.method?.toLowerCase() === "get") {
      original._retryCount = original._retryCount ?? 0;
      if (original._retryCount < MAX_NETWORK_RETRIES) {
        original._retryCount += 1;
        await delay(NETWORK_RETRY_DELAY_MS * original._retryCount);
        return apiClient(original);
      }
    }

    return Promise.reject(error);
  },
);
