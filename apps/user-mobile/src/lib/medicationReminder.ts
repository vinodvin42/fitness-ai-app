import type { Medication, MedicationMealTiming } from "@fitness-ai-app/types";
import { BRAND_NAME } from "./brand";

/**
 * Shared helpers for the medicine reminder screens (Figma Medicine 01-05).
 * Privacy: lock-screen text is generic unless the user turned on "Detailed
 * Preview". The on-screen "Lock-screen preview" card and the scheduled
 * notification both use `lockScreenCopy`, so they can never disagree.
 */

export interface LockScreenCopy {
  title: string;
  /** Rendered one per line on the preview card; joined with "\n" for the notification body. */
  lines: string[];
}

export function lockScreenCopy(detailedPreview: boolean, reminderTitle: string): LockScreenCopy {
  const open = `Open ${BRAND_NAME} to view details.`;
  return {
    title: BRAND_NAME,
    lines: detailedPreview && reminderTitle.trim() ? [reminderTitle.trim(), open] : ["You have a scheduled reminder", open],
  };
}

export function lockScreenBody(copy: LockScreenCopy): string {
  return copy.lines.join("\n");
}

export const MEAL_LABEL: Record<MedicationMealTiming, string> = {
  before_food: "Before Food",
  after_food: "After Food",
};

const LEGACY_TOKENS: Array<[string, MedicationMealTiming]> = [
  ["Before food", "before_food"],
  ["After food", "after_food"],
];

/** Meal timing now has its own column; older rows carried it as a leading token in `notes`. */
export function splitMedicationNotes(med: Pick<Medication, "mealTiming" | "notes">): {
  mealTiming: MedicationMealTiming | null;
  note: string;
} {
  const notes = med.notes ?? "";
  for (const [token, value] of LEGACY_TOKENS) {
    if (notes === token) return { mealTiming: med.mealTiming ?? value, note: "" };
    if (notes.startsWith(`${token} · `)) return { mealTiming: med.mealTiming ?? value, note: notes.slice(token.length + 3) };
  }
  return { mealTiming: med.mealTiming, note: notes };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function tzAbbreviation(d: Date): string {
  try {
    // Intl only abbreviates a few zones in en-US ("GMT+5:30" elsewhere); name India explicitly.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return "IST";
    const part = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName");
    if (part?.value) return part.value;
  } catch {
    // fall through
  }
  return "";
}

export function formatClockTz(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const tz = tzAbbreviation(d);
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}${tz ? ` ${tz}` : ""}`;
}

/** "24 Oct 2026" */
export function formatDayMonthYear(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Saturday 24 Oct 2026" */
export function formatLongDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${WEEKDAYS[d.getDay()]} ${formatDayMonthYear(d)}`;
}

/** "24 Oct 2026 · 6:32 AM IST" */
export function formatStamp(iso: string | Date): string {
  return `${formatDayMonthYear(iso)} · ${formatClockTz(iso)}`;
}

/** "Sat 24 Oct 2026 · 6:30 AM IST" */
export function formatScheduledStamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${formatStamp(d)}`;
}

/** Local YYYY-MM-DD of an instant (the due endpoint resolves days in the user's timezone). */
export function localDateOf(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today at "HH:MM" local, as an ISO instant (matches the server's scheduledFor for that dose). */
export function todayAtIso(hhmm: string, now = new Date()): string | null {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).toISOString();
}
