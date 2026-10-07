/** Formatting helpers for the My Gym screens. */

/** "05:00" -> "5:00 AM". */
export function fmtGymTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fmtGymRange(opensAt: string | null, closesAt: string | null, closed: boolean): string {
  if (closed || !opensAt || !closesAt) return "Closed";
  return `${fmtGymTime(opensAt)} – ${fmtGymTime(closesAt)}`;
}

const DAY_SHORT: Record<string, string> = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
export const gymDayShort = (day: string) => DAY_SHORT[day] ?? day;

export const fmtGymDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const fmtGymDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const GYM_HELP_TOPIC_LABEL = {
  form_check: "Form check on an exercise",
  machine_help: "Help with a machine",
  trainer_available: "Is a trainer available now?",
  other: "Something else",
} as const;

export const GYM_PRIVACY_FOOTER =
  "Your gym sees only that you joined and if you're active. It never sees your health, food logs, photos or AI chats.";
