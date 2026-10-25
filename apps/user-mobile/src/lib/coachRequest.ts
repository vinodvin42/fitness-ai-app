/**
 * Asking a coach for guidance before paying (Figma coach/02, 05, 07; 25 Oct 2026).
 * Pure helpers so tests/coachRequest.check.cjs can run them in plain Node.
 */

/**
 * How many hours a coach has to answer a request. The API owns the real
 * deadline (`replyBy` on each request); this only words the "how it works"
 * line before a request exists. Keep equal to REQUEST_REPLY_WINDOW_MS in
 * apps/api/src/lib/relationshipActivation.ts.
 */
export const REQUEST_REPLY_HOURS = 48;

/** How many days ahead a preferred start day can be picked (the API accepts up to 60). */
export const PREFERRED_DAYS_AHEAD = 7;

/** `YYYY-MM-DD` for a date in the member's own time zone (what they see on the day strip). */
export function localDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** The next `count` days starting today, as `{ key, date }`. */
export function upcomingDays(count: number, from: Date = new Date()): Array<{ key: string; date: Date }> {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return { key: localDateKey(date), date };
  });
}

/** "Mon 27 Oct, 4:20 pm": when a coach's reply window closes, in the member's time zone. */
export function formatReplyBy(iso: string, locale?: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** The preferred start day. The API stores it as a date at UTC midnight, so it is read in UTC to avoid sliding a day. */
export function formatPreferredDay(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** The booking screen's date key for a stored preferred day, or null when it is in the past (then the booking starts from today). */
export function preferredDayForBooking(iso: string | null | undefined, today: Date = new Date()): string | null {
  if (!iso) return null;
  const key = new Date(iso).toISOString().slice(0, 10);
  return key >= localDateKey(today) ? key : null;
}
