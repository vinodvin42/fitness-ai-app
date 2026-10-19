import { formatRupees } from "./money";

/** Formatting helpers for coaching session screens. */

/** "24 Oct 2026". */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Price from paise; INR (or unknown currency) renders with the rupee sign — see lib/money. */
export function formatSessionPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "-";
  return formatRupees(cents, { currency });
}
