/** Formatting helpers for coaching session screens. */

/** "24 Oct 2026". */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Price from cents; INR (or unknown currency) renders with the rupee sign. */
export function formatSessionPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "-";
  const amount = (cents / 100).toFixed(2);
  if (!currency || currency === "INR") return `₹${amount}`;
  return `${currency} ${amount}`;
}
