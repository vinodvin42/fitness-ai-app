/** India Standard Time helpers for dates the Super Admin picks (UTC+05:30, no DST). */

export const IST_OFFSET_MS = 330 * 60 * 1000;

/** The first midnight in India at or after `date`. */
export function indiaMidnightOnOrAfter(date: Date): Date {
  const local = new Date(date.getTime() + IST_OFFSET_MS);
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const midnight = midnightLocal - IST_OFFSET_MS;
  return new Date(midnight >= date.getTime() ? midnight : midnight + 24 * 60 * 60 * 1000);
}

/** `YYYY-MM-DD` of a moment, in India time. */
export function indiaDate(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` means midnight India time on that date; anything else is a full timestamp. */
export function parseEffectiveFrom(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value);
}

/** True when `value` is a date (YYYY-MM-DD) or timestamp `parseEffectiveFrom` can read. */
export function isValidEffectiveFrom(value: string): boolean {
  return !Number.isNaN(parseEffectiveFrom(value).getTime());
}

/** ₹ amount from paise, Indian digit grouping. */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
