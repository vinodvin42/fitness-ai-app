import type { RecoveryTrendDay } from "@fitness-ai-app/types";

/**
 * Sleep and recovery trend maths for Recovery (owner, 25 Oct 2026: "sleep
 * duration vs sleep needed, awake, light, deep and REM sleep, sleep
 * efficiency, sleep consistency, sleep trends, HRV, resting heart rate,
 * stress, recovery trends"). Pure functions over GET /recovery/trends rows,
 * checked by tests/sleepStats.check.cjs. Nothing here is guessed:
 *
 * - Sleep need is the general 8-hour adult target the recovery score already
 *   uses (sleepNeedHours from the API), not a personal measurement.
 * - Efficiency = time asleep / time in bed. It needs time in bed, and either
 *   recorded awake minutes or hours asleep below time in bed: a self-log with
 *   only bed and wake times can't tell awake time apart, so it gets none.
 * - Consistency = how much bedtime and wake time move from night to night
 *   (standard deviation over the last 7 nights with both times, at least 3).
 * - Trends compare a period's average with the period before it.
 */

const DAY_MS = 86_400_000;

/** Days from YYYY-MM-DD `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** YYYY-MM-DD of the phone's calendar day (the API stores each log under the day the app sent). */
export function localYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "7h 05m" from minutes ("55m" under an hour). */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Rows within the last `period` calendar days ending `today` (inclusive), oldest first. */
export function inPeriod(items: RecoveryTrendDay[], period: number, today: string, offset = 0): RecoveryTrendDay[] {
  return items.filter((d) => {
    const ago = daysBetween(d.date, today);
    return ago >= offset && ago < offset + period;
  });
}

export function efficiencyPct(d: RecoveryTrendDay): number | null {
  if (d.sleepHours == null || !d.sleepInBedMin) return null;
  const asleep = d.sleepHours * 60;
  if (d.sleepAwakeMin == null && asleep >= d.sleepInBedMin - 1) return null;
  return Math.max(0, Math.min(100, Math.round((asleep / d.sleepInBedMin) * 100)));
}

export interface Stages {
  awake: number;
  light: number;
  deep: number;
  rem: number;
}

/** Minutes per stage, when the source recorded stages. */
export function stagesOf(d: RecoveryTrendDay): Stages | null {
  if (d.sleepLightMin == null && d.sleepDeepMin == null && d.sleepRemMin == null) return null;
  return { awake: d.sleepAwakeMin ?? 0, light: d.sleepLightMin ?? 0, deep: d.sleepDeepMin ?? 0, rem: d.sleepRemMin ?? 0 };
}

/** Each sleep stage as a whole-number share of the time asleep (light + deep + REM). */
export function stageShares(s: Stages): { light: number; deep: number; rem: number } | null {
  const asleep = s.light + s.deep + s.rem;
  if (asleep <= 0) return null;
  return { light: Math.round((s.light / asleep) * 100), deep: Math.round((s.deep / asleep) * 100), rem: Math.round((s.rem / asleep) * 100) };
}

/** Average minutes per stage over the nights that recorded stages. */
export function averageStages(items: RecoveryTrendDay[]): (Stages & { nights: number }) | null {
  const all = items.map(stagesOf).filter((s): s is Stages => s != null);
  if (all.length === 0) return null;
  const avg = (k: keyof Stages) => Math.round(all.reduce((sum, s) => sum + s[k], 0) / all.length);
  return { awake: avg("awake"), light: avg("light"), deep: avg("deep"), rem: avg("rem"), nights: all.length };
}

/** The most recent logged night (the latest row with hours slept). */
export function lastNight(items: RecoveryTrendDay[]): RecoveryTrendDay | null {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].sleepHours != null) return items[i];
  return null;
}

export interface SleepVsNeed {
  nights: number;
  avgHours: number;
  /** Nights at or above the need. */
  metNights: number;
  /** Minutes short of the need, summed over the nights that fell short. */
  debtMin: number;
}

export function sleepVsNeed(items: RecoveryTrendDay[], needHours: number): SleepVsNeed | null {
  const hours = items.map((d) => d.sleepHours).filter((h): h is number => h != null);
  if (hours.length === 0) return null;
  return {
    nights: hours.length,
    avgHours: hours.reduce((a, b) => a + b, 0) / hours.length,
    metNights: hours.filter((h) => h >= needHours - 1 / 60).length,
    debtMin: Math.round(hours.reduce((sum, h) => sum + Math.max(0, needHours - h) * 60, 0)),
  };
}

/** Bedtime as minutes after noon, so 23:30 and 00:30 are an hour apart (not 23). */
export function bedMinutes(iso: string): number {
  const d = new Date(iso);
  return (d.getHours() * 60 + d.getMinutes() - 12 * 60 + 1440) % 1440;
}

/** Wake time as minutes after midnight. */
export function wakeMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function sd(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
}

export type ConsistencyLabel = "Very consistent" | "Fairly consistent" | "Irregular";

export interface Consistency {
  nights: number;
  /** Typical night-to-night shift, in minutes (standard deviation). */
  bedtimeSpreadMin: number;
  wakeSpreadMin: number;
  /** Average bedtime (minutes after noon) and wake time (minutes after midnight). */
  avgBedMin: number;
  avgWakeMin: number;
  label: ConsistencyLabel;
}

export const CONSISTENCY_MIN_NIGHTS = 3;

/** Over the latest 7 nights that have both bed and wake times. Null with fewer than 3. */
export function consistency(items: RecoveryTrendDay[]): Consistency | null {
  const nights = items.filter((d) => d.sleepStart && d.sleepEnd).slice(-7);
  if (nights.length < CONSISTENCY_MIN_NIGHTS) return null;
  const beds = nights.map((d) => bedMinutes(d.sleepStart as string));
  const wakes = nights.map((d) => wakeMinutes(d.sleepEnd as string));
  const bedSd = Math.round(sd(beds));
  const wakeSd = Math.round(sd(wakes));
  const worst = Math.max(bedSd, wakeSd);
  return {
    nights: nights.length,
    bedtimeSpreadMin: bedSd,
    wakeSpreadMin: wakeSd,
    avgBedMin: Math.round(beds.reduce((a, b) => a + b, 0) / beds.length),
    avgWakeMin: Math.round(wakes.reduce((a, b) => a + b, 0) / wakes.length),
    label: worst <= 30 ? "Very consistent" : worst <= 60 ? "Fairly consistent" : "Irregular",
  };
}

/** "11:15 PM" for minutes after midnight (bedtimes: pass bedMinutes + 720). */
export function clockText(minutesAfterMidnight: number): string {
  const m = ((Math.round(minutesAfterMidnight) % 1440) + 1440) % 1440;
  const d = new Date(2026, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface PeriodStat {
  avg: number;
  n: number;
  /** Average of the period before, when it has data. */
  prevAvg: number | null;
  /** Whole-number % change vs the period before (null when that has no data). */
  changePct: number | null;
}

/** Average of one value over the last `period` days and the change vs the `period` days before. */
export function periodStat(items: RecoveryTrendDay[], pick: (d: RecoveryTrendDay) => number | null, period: number, today: string): PeriodStat | null {
  const values = (rows: RecoveryTrendDay[]) => rows.map(pick).filter((v): v is number => v != null);
  const now = values(inPeriod(items, period, today));
  if (now.length === 0) return null;
  const prev = values(inPeriod(items, period, today, period));
  const avg = now.reduce((a, b) => a + b, 0) / now.length;
  const prevAvg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
  return {
    avg,
    n: now.length,
    prevAvg,
    changePct: prevAvg != null && prevAvg !== 0 ? Math.round(((avg - prevAvg) / prevAvg) * 100) : null,
  };
}

/** One point per logged day in the period (days without a value are left out), oldest first. */
export function series(items: RecoveryTrendDay[], pick: (d: RecoveryTrendDay) => number | null, period: number, today: string) {
  return inPeriod(items, period, today)
    .map((d) => ({ date: d.date, value: pick(d) }))
    .filter((p): p is { date: string; value: number } => p.value != null);
}

/**
 * Last night's bed and wake times ("HH:MM") as instants for PUT /recovery: a
 * bedtime at or after the wake time is the evening before (23:00 then 07:00),
 * otherwise the same morning (01:00 then 07:00).
 */
export function bedWakeTimes(bed: string, wake: string, now: Date = new Date()): { sleepStart: string; sleepEnd: string } {
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), wh, wm);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
  if (start.getTime() >= end.getTime()) start.setDate(start.getDate() - 1);
  return { sleepStart: start.toISOString(), sleepEnd: end.toISOString() };
}

/** Stress score 0-100 in words, the same bands as the Recovery dashboard (API stressLevel). */
export function stressWord(score: number): "low" | "moderate" | "high" {
  return score < 34 ? "low" : score < 67 ? "moderate" : "high";
}
