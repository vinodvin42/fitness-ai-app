/**
 * 08.03 Complaints (Oct 2026) — shared rules for complaint tickets.
 *
 * India's Consumer Protection (E-Commerce) Rules 2020, rule 4(5): a
 * complaint must be acknowledged within 48 hours and resolved within one
 * month of receipt. The ticket reference shown the moment a member submits
 * is the acknowledgement; the due date below is the resolve-by date.
 */

const DAY_MS = 86_400_000;

/** India Standard Time is UTC+5:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000;

/**
 * Resolve-by date for a complaint received at `receivedAt`: the earlier of
 * 30 days later and the same date next month, counted on India's calendar.
 * "One month" is shorter than 30 days from late January (28 Feb) and longer
 * from a 31-day month, so taking the earlier date never runs past either
 * reading. The time of day is kept; a day that doesn't exist next month
 * (31 Jan) becomes that month's last day.
 */
export function complaintDueDate(receivedAt: Date): Date {
  const plus30 = new Date(receivedAt.getTime() + 30 * DAY_MS);
  // Shift to India time so the UTC getters read the Indian calendar date.
  const ist = new Date(receivedAt.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const nextMonth = ist.getUTCMonth() + 1;
  const lastDayNextMonth = new Date(Date.UTC(y, nextMonth + 1, 0)).getUTCDate();
  const sameDateNextMonth = new Date(
    Date.UTC(y, nextMonth, Math.min(ist.getUTCDate(), lastDayNextMonth), ist.getUTCHours(), ist.getUTCMinutes(), ist.getUTCSeconds(), ist.getUTCMilliseconds()) -
      IST_OFFSET_MS,
  );
  return sameDateNextMonth < plus30 ? sameDateNextMonth : plus30;
}

/** The reference a member and staff quote for a complaint, e.g. "C-1A2B3C4D". */
export function complaintReference(ticketId: string): string {
  return `C-${ticketId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export const COMPLAINT_OUTCOME_LABELS = {
  upheld: "Upheld",
  partly_upheld: "Partly upheld",
  not_upheld: "Not upheld",
} as const;

/** "17 Nov 2026" in India time, for messages to members. */
export function formatComplaintDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
