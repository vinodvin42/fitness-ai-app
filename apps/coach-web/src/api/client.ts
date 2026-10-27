import axios from "axios";

/**
 * The coach API client, ported from apps/coach-mobile/src/api/client.ts with
 * the same behaviour: bearer token on every request, one shared refresh on a
 * 401, and two quiet retries for a GET that failed on the network.
 *
 * Tokens live in localStorage under the same keys the old web build used, so
 * a coach who was signed in on this address stays signed in after the switch.
 */
const ACCESS_TOKEN_KEY = "fynroxcoach.accessToken";
const REFRESH_TOKEN_KEY = "fynroxcoach.refreshToken";

export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export const apiClient = axios.create({ baseURL: apiBaseUrl });

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getStoredTokens() {
  return { accessToken: read(ACCESS_TOKEN_KEY), refreshToken: read(REFRESH_TOKEN_KEY) };
}

export function storeTokens(accessToken: string, refreshToken: string) {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // Storage blocked: the session lasts until the tab closes.
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Called when the session can't be refreshed (expired, suspended): the app signs out. */
let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(handler: () => void) {
  onSessionLost = handler;
}

apiClient.interceptors.request.use((config) => {
  const { accessToken } = getStoredTokens();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${apiBaseUrl}/professionals/auth/refresh`, { refreshToken });
    storeTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return data.tokens.accessToken as string;
  } catch {
    clearTokens();
    onSessionLost?.();
    return null;
  }
}

const MAX_NETWORK_RETRIES = 2;
const NETWORK_RETRY_DELAY_MS = 800;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
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
