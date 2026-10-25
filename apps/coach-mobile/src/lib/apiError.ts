import axios from "axios";
import type { ApiError } from "@fitness-ai-app/types";

/** Mirrors apps/user-mobile/src/lib/apiError.ts exactly. */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined;
    if (data?.error?.message) return data.error.message;
  }
  return fallback;
}

/** The API's stable error `code` (e.g. `relationship_expired`), for failures that need their own handling. Mirrors apps/user-mobile. */
export function extractErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { code?: string } } | undefined;
    return data?.error?.code;
  }
  return undefined;
}
