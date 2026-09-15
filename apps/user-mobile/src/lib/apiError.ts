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

/**
 * U6 Premium entitlement (15 Sep 2026) — some failures need to be handled
 * differently from a generic "show an Alert" one, e.g. `payments.
 * service.ts`'s `entitlement_activation_failed` (money captured, retry
 * available — see useRazorpayPurchase.ts's onCheckoutSuccess). Every
 * apps/api ApiHttpError already carries a stable `code`; this just exposes
 * it the same way extractErrorMessage exposes `message`.
 */
export function extractErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { code?: string } } | undefined;
    return data?.error?.code;
  }
  return undefined;
}

/** Companion to extractErrorCode — apps/api's ApiHttpError `details` payload, when present (e.g. `{ paymentId }` on entitlement_activation_failed). */
export function extractErrorDetails(err: unknown): Record<string, unknown> | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { details?: unknown } } | undefined;
    return (data?.error?.details ?? undefined) as Record<string, unknown> | undefined;
  }
  return undefined;
}
