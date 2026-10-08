import axios from "axios";
import Constants from "expo-constants";
import * as SecureStore from "../lib/secureStore";

/**
 * Mirrors apps/user-mobile/src/api/client.ts exactly, keyed under a
 * "fynroxcoach.*" prefix instead of "fynrox.*" so this app's tokens
 * never collide with the consumer app's if both are ever installed on the
 * same device/simulator — and pointed at the `/professionals/auth/*`
 * refresh endpoint instead of `/auth/refresh`, since `Professional` is a
 * fully separate identity (own JWT secret, own refresh-token table — see
 * apps/api/prisma/schema.prisma's Professional/ProfessionalRefreshToken
 * models).
 */

const ACCESS_TOKEN_KEY = "fynroxcoach.accessToken";
const REFRESH_TOKEN_KEY = "fynroxcoach.refreshToken";

// Go-live hardening (4 Sep 2026) — was reading only Constants.expoConfig's
// static extra.apiBaseUrl (hardcoded to localhost), so a production web
// build had no way to point at a real deployed API. Now mirrors
// apps/user-mobile/src/api/client.ts's own fix exactly:
// EXPO_PUBLIC_API_BASE_URL is a build-time env var Expo actually inlines
// into the bundle (confirmed for this exact mechanism on the sibling app).
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

// On a 401, try exactly one silent refresh-and-retry against
// /professionals/auth/refresh — same shape as user-mobile's own interceptor,
// see that file's comment for the GET-only network-retry reasoning below.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await getStoredTokens();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${apiBaseUrl}/professionals/auth/refresh`, { refreshToken });
    await storeTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return data.tokens.accessToken as string;
  } catch {
    await clearTokens();
    return null;
  }
}

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
