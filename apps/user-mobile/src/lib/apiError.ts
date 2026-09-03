import axios from "axios";

/**
 * Pulls apps/api's `{error: {message}}` envelope out of a failed axios
 * request into a user-facing string, without resorting to `any`. Shared
 * across every screen with a mutation (a button press that writes data)
 * that can fail — part of the cross-cutting "empty/loading/error states"
 * gap (docs/platform/roadmap.md): before this, only Security's
 * password-change/delete-account flows surfaced a real error message on
 * failure — every other mutation (purchase, subscribe/cancel, log a
 * meal/set/measurement, toggle a reminder) just silently re-enabled its
 * button with no explanation if the request failed. This was previously
 * defined locally inside SecurityScreen.tsx; moved here so every screen
 * with a mutation can share one implementation.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    if (typeof data?.error?.message === "string") return data.error.message;
  }
  return fallback;
}
