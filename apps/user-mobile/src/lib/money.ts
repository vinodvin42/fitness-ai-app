/**
 * The one way this app shows a price.
 *
 * Every amount from the API is an integer in the currency's smallest unit
 * (the `...Cents` fields are paise for INR). This turns it into what an
 * Indian buyer expects to read: Indian digit grouping (lakh/crore, so
 * ₹1,00,000 rather than ₹100,000) and no ".00" on a whole-rupee price.
 *
 *   149900  -> ₹1,499
 *   177000  -> ₹1,770
 *   34950   -> ₹349.50
 *   10000000 -> ₹1,00,000
 *
 * Done by hand rather than through Intl: Android's Hermes builds do not all
 * ship en-IN grouping, and a price that groups differently on two phones is
 * worse than no grouping at all.
 */
export interface FormatRupeesOptions {
  /** Text to show for a zero amount instead of "₹0" (e.g. "Free"). */
  free?: string;
  /** ISO currency code from the API; anything other than INR is shown with its code. */
  currency?: string | null;
}

/** "1234567" -> "12,34,567" (last three digits, then groups of two). */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function formatRupees(paise: number, opts: FormatRupeesOptions = {}): string {
  if (paise === 0 && opts.free != null) return opts.free;
  const abs = Math.round(Math.abs(paise));
  const whole = groupIndian(String(Math.floor(abs / 100)));
  const fraction = abs % 100;
  const amount = fraction === 0 ? whole : `${whole}.${String(fraction).padStart(2, "0")}`;
  const sign = paise < 0 ? "-" : "";
  if (opts.currency && opts.currency !== "INR") return `${sign}${opts.currency} ${amount}`;
  return `${sign}₹${amount}`;
}
