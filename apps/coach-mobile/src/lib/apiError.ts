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
