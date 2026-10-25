/**
 * Start / end dates for reminders and medicines (owner, 25 Oct 2026: "start date and end date or
 * number of days"). Pure date maths, no imports, so tests/reminderSchedule.check.cjs can run it.
 *
 * Expo's repeating weekly trigger has no start or end date. So:
 * - a reminder that has started and doesn't end within the next WINDOW_DAYS days keeps the weekly
 *   repeating trigger, as before;
 * - otherwise (it starts later, or ends soon) it gets one dated alarm per occurrence, for at most
 *   WINDOW_DAYS days from its start or from today.
 * The app re-plans on every open (lib/useLocalReminderRefresh.ts), which moves a reminder from
 * weekly to dated as its end comes near and tops the dated window up.
 *
 * Dates are the member's calendar days as "YYYY-MM-DD"; times are local.
 */

export const WINDOW_DAYS = 14;
export const MAX_DAYS = 365;

export type ScheduleRule = {
  daysOfWeek: number[];
  times: Array<{ hour: number; minute: number }>;
  startDate?: string | null;
  endDate?: string | null;
};

export type SchedulePlan = { kind: "none" } | { kind: "weekly" } | { kind: "dated"; at: Date[] };

const ymdOnly = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null);

/** The local calendar day of `d` as YYYY-MM-DD. */
export function localYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD plus `n` days (calendar arithmetic, no time zone involved). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Days from `start` to `end`, both counted (1 Nov to 3 Nov = 3). */
export function daysInclusive(start: string, end: string): number {
  const [a, b] = [start, end].map((v) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000) + 1;
}

/** "For N days" from `start`: the last day, counting the start day as day 1. */
export function endDateFromDays(start: string, days: number): string {
  return addDays(start, Math.max(1, Math.round(days)) - 1);
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** How to schedule one reminder right now. */
export function planSchedule(rule: ScheduleRule, now: Date = new Date(), windowDays: number = WINDOW_DAYS): SchedulePlan {
  const today = localYmd(now);
  const start = ymdOnly(rule.startDate);
  const end = ymdOnly(rule.endDate);
  if (end && end < today) return { kind: "none" };
  if (start && end && end < start) return { kind: "none" };
  const started = !start || start <= today;
  if (started && (!end || end >= addDays(today, windowDays))) return { kind: "weekly" };

  const from = started ? today : (start as string);
  const windowEnd = addDays(from, windowDays - 1);
  const to = end && end < windowEnd ? end : windowEnd;
  const at: Date[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!rule.daysOfWeek.includes(weekdayOf(day))) continue;
    const [y, m, d] = day.split("-").map(Number);
    for (const t of rule.times) {
      const when = new Date(y, m - 1, d, t.hour, t.minute, 0, 0);
      if (when.getTime() > now.getTime()) at.push(when);
    }
  }
  at.sort((a, b) => a.getTime() - b.getTime());
  return { kind: "dated", at };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Nov", or "1 Jan 2027" when it isn't this year. */
export function shortDate(ymd: string, today: string = localYmd()): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
}

/** The list's date line: "Ended", "From 1 Nov", "1 Nov to 30 Nov", "Until 30 Nov", or null without dates. */
export function dateRangeLabel(startDate: string | null | undefined, endDate: string | null | undefined, today: string = localYmd()): string | null {
  const start = ymdOnly(startDate);
  const end = ymdOnly(endDate);
  if (end && end < today) return "Ended";
  if (start && start > today) return end ? `${shortDate(start, today)} to ${shortDate(end, today)}` : `From ${shortDate(start, today)}`;
  if (end) return end === today ? "Ends today" : `Until ${shortDate(end, today)}`;
  return null;
}
