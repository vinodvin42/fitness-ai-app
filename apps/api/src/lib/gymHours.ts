/**
 * Gym opening-hours maths for "My Gym". Pure functions: timings are stored as
 * day expressions ("daily", "mon-sat", "mon,wed", "fri-mon") plus "HH:MM"
 * open/close times in the gym's own timezone.
 */
export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface TimingLike {
  days: string;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
  kind: "regular" | "women_only" | "special";
}

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Expands a day expression to a set of day indexes (0 = Sunday). Returns null when it is not valid. */
export function parseDays(expr: string): Set<number> | null {
  const out = new Set<number>();
  const parts = expr
    .toLowerCase()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === "daily") {
      for (let i = 0; i < 7; i++) out.add(i);
      continue;
    }
    const [a, b, extra] = part.split("-").map((p) => p.trim());
    if (extra !== undefined) return null;
    const from = DAY_KEYS.indexOf(a as DayKey);
    if (from < 0) return null;
    if (b === undefined) {
      out.add(from);
      continue;
    }
    const to = DAY_KEYS.indexOf(b as DayKey);
    if (to < 0) return null;
    for (let i = from; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === to) break;
    }
  }
  return out;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Weekday index (0 = Sunday) and minutes since midnight at `now` in `timeZone`. */
export function localParts(now: Date, timeZone: string): { day: number; minutes: number } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "Asia/Kolkata";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = DAY_KEYS.indexOf(get("weekday").toLowerCase().slice(0, 3) as DayKey);
  return { day: day < 0 ? 0 : day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

type Window = { opensAt: string; closesAt: string };

/** The rows that decide opening for `day`: special rows override regular ones; women_only never decides. */
function decidingRows(timings: TimingLike[], day: number): TimingLike[] {
  const covering = timings.filter((t) => t.kind !== "women_only" && parseDays(t.days)?.has(day));
  const special = covering.filter((t) => t.kind === "special");
  return special.length > 0 ? special : covering;
}

function windowsFor(timings: TimingLike[], day: number): Window[] {
  return decidingRows(timings, day)
    .filter((t) => !t.closed && t.opensAt && t.closesAt)
    .map((t) => ({ opensAt: t.opensAt as string, closesAt: t.closesAt as string }));
}

export interface OpenState {
  /** null when the gym has not entered any opening hours at all. */
  openNow: boolean | null;
  todayClosed: boolean;
  todayWindows: Window[];
  dayIndex: number;
}

export function computeOpenState(timings: TimingLike[], now: Date, timeZone: string): OpenState {
  const { day, minutes } = localParts(now, timeZone);
  const today = windowsFor(timings, day);
  // Unknown only when the gym has entered no opening hours at all; days without a row count as closed.
  const known = timings.some((t) => t.kind !== "women_only");
  let open = false;
  for (const w of today) {
    const o = toMinutes(w.opensAt);
    const c = toMinutes(w.closesAt);
    if (c > o ? minutes >= o && minutes < c : minutes >= o) open = true; // overnight: open until midnight today
  }
  // Spill-over from yesterday's overnight window.
  const prev = (day + 6) % 7;
  for (const w of windowsFor(timings, prev)) {
    const o = toMinutes(w.opensAt);
    const c = toMinutes(w.closesAt);
    if (c <= o && minutes < c) open = true;
  }
  return {
    openNow: known ? open : null,
    todayClosed: known && today.length === 0,
    todayWindows: today,
    dayIndex: day,
  };
}
