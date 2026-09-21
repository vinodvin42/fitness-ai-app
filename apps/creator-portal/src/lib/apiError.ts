import axios from "axios";

/**
 * Pulls apps/api's `{error: {message}}` envelope out of a failed axios
 * request into a user-facing string — copied verbatim from
 * apps/admin-web/src/lib/apiError.ts (same backend, same error envelope
 * shape).
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    if (typeof data?.error?.message === "string") return data.error.message;
  }
  return fallback;
}
