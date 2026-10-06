import type { Medication, MedicationDueDose, Reminder, ReminderCategory, Routine } from "@fitness-ai-app/types";

/**
 * Client-side composition for "Reminders & Routines" (Train 13). Nothing here
 * is stored: it merges the user's reminders, medications (+ today's dose
 * statuses) and saved routines into one list. Day numbers follow the API
 * (0 = Sunday .. 6 = Saturday).
 */

export type AgendaKind = "reminder" | "medication" | "routine";

export interface AgendaItem {
  key: string;
  kind: AgendaKind;
  id: string;
  title: string;
  /** Minutes after midnight; null for items with no time (routines). */
  minutes: number | null;
  /** Human text such as "7:00 AM · Daily". */
  subtitle: string;
  category: ReminderCategory | "medication" | "routine";
  /** Whether the on/off switch is on (reminders: isEnabled, medications: isActive). Undefined = no switch. */
  enabled?: boolean;
  /** Dose outcome for medication items drawn from /medications/due. */
  doseStatus?: MedicationDueDose["status"];
  reminder?: Reminder;
  medication?: Medication;
  routine?: Routine;
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (sorted.length === 7) return "Daily";
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  return sorted.map((d) => DAY_ABBR[d]).join(" ");
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function medicationOccursOn(m: Medication, date: Date): boolean {
  if (!m.isActive || !m.daysOfWeek.includes(date.getDay())) return false;
  const day = ymd(date);
  if (m.startDate.slice(0, 10) > day) return false;
  if (m.endDate && m.endDate.slice(0, 10) < day) return false;
  return true;
}

export function reminderItem(r: Reminder): AgendaItem {
  const minutes = r.hour * 60 + r.minute;
  return {
    key: `reminder-${r.id}`,
    kind: "reminder",
    id: r.id,
    title: r.label,
    minutes,
    subtitle: `${formatMinutes(minutes)} · ${describeDays(r.daysOfWeek)}`,
    category: r.category,
    enabled: r.isEnabled,
    reminder: r,
  };
}

export function medicationItems(m: Medication): AgendaItem[] {
  return m.scheduleTimes.map((hm) => {
    const minutes = parseHm(hm);
    return {
      key: `med-${m.id}-${hm}`,
      kind: "medication" as const,
      id: m.id,
      title: m.name,
      minutes,
      subtitle: `${formatMinutes(minutes)} · ${describeDays(m.daysOfWeek)}`,
      category: "medication" as const,
      enabled: m.isActive,
      medication: m,
    };
  });
}

export function routineItem(r: Routine): AgendaItem {
  const n = r.exercises.length;
  return {
    key: `routine-${r.id}`,
    kind: "routine",
    id: r.id,
    title: r.name,
    minutes: null,
    subtitle: `Saved routine · ${n} exercise${n === 1 ? "" : "s"}`,
    category: "routine",
    routine: r,
  };
}

const byTime = (a: AgendaItem, b: AgendaItem) => (a.minutes ?? 9999) - (b.minutes ?? 9999) || a.title.localeCompare(b.title);

/** Today's pending items: reminders for today's weekday, plus medication doses not yet logged. */
export function composeToday(reminders: Reminder[], dueDoses: MedicationDueDose[], medications: Medication[], today: Date): AgendaItem[] {
  const meds = new Map(medications.map((m) => [m.id, m]));
  const fromReminders = reminders.filter((r) => r.daysOfWeek.includes(today.getDay())).map(reminderItem);
  const fromDoses = dueDoses
    .filter((d) => d.status !== "taken" && d.status !== "skipped")
    .map((d): AgendaItem => {
      const t = new Date(d.scheduledFor);
      const minutes = t.getHours() * 60 + t.getMinutes();
      const med = meds.get(d.medicationId);
      return {
        key: `dose-${d.medicationId}-${d.scheduledFor}`,
        kind: "medication",
        id: d.medicationId,
        title: d.name,
        minutes,
        subtitle: `${formatMinutes(minutes)} · ${d.dosage}${d.status === "missed" ? " · Missed" : d.status === "snoozed" ? " · Snoozed" : ""}`,
        category: "medication",
        enabled: med?.isActive ?? true,
        doseStatus: d.status,
        medication: med,
      };
    });
  return [...fromReminders, ...fromDoses].sort(byTime);
}

/** Doses already taken/skipped today. */
export function composeHistory(dueDoses: MedicationDueDose[]): AgendaItem[] {
  return dueDoses
    .filter((d) => d.status === "taken" || d.status === "skipped")
    .map((d): AgendaItem => {
      const t = new Date(d.scheduledFor);
      const minutes = t.getHours() * 60 + t.getMinutes();
      return {
        key: `hist-${d.medicationId}-${d.scheduledFor}`,
        kind: "medication",
        id: d.medicationId,
        title: d.name,
        minutes,
        subtitle: `${formatMinutes(minutes)} · ${d.dosage}`,
        category: "medication",
        doseStatus: d.status,
      };
    })
    .sort(byTime);
}

export interface UpcomingDay {
  label: string;
  date: Date;
  items: AgendaItem[];
}

/** The next `days` days after today (enabled reminders and active medications only). */
export function composeUpcoming(reminders: Reminder[], medications: Medication[], today: Date, days = 6): UpcomingDay[] {
  const out: UpcomingDay[] = [];
  for (let i = 1; i <= days; i++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const items = [
      ...reminders.filter((r) => r.isEnabled && r.daysOfWeek.includes(date.getDay())).map(reminderItem),
      ...medications.filter((m) => medicationOccursOn(m, date)).flatMap(medicationItems),
    ].sort(byTime);
    if (items.length > 0) {
      out.push({
        label: i === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
        date,
        items,
      });
    }
  }
  return out;
}

/** Every recurring definition: all reminders, all medication times, saved routines. */
export function composeScheduled(reminders: Reminder[], medications: Medication[], routines: Routine[]): AgendaItem[] {
  return [
    ...reminders.map(reminderItem),
    ...medications.filter((m) => m.isActive).flatMap(medicationItems),
    ...routines.map(routineItem),
  ].sort(byTime);
}
