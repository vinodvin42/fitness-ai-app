import { prisma } from "../../db/prisma";
import type { AnalyticsQuery } from "./trainingAnalytics.schema";

/**
 * Train 12 analytics — computed only from real ExerciseSetLog/WorkoutSession
 * rows. Volume = reps x weightKg of non-warm-up sets (bodyweight sets count
 * as sets but contribute 0 volume). Weeks are UTC Monday-based (no stored
 * user timezone, same simplification as nutrition's startOfToday).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

type LogRow = {
  sessionId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  isWarmup: boolean;
  loggedAt: Date;
  exercise: { name: string; muscleGroup: string };
};

function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(x.getTime() - dow * DAY_MS);
}

function volumeOf(l: { weightKg: number | null; reps: number }): number {
  return l.weightKg ? l.weightKg * l.reps : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Weekly consistency = completed sessions this (UTC Monday) week / planned
 * sessions per week, capped at 100%. Planned comes from the user's own
 * onboarding answer: trainingDaysPerWeek, else the count of preferredTrainingDays.
 * No plan on file -> percent is null (the client says so; nothing is guessed).
 */
export function weeklyConsistency(planned: number | null, completed: number) {
  if (!planned || planned <= 0) return { plannedPerWeek: null, completedThisWeek: completed, percent: null as number | null };
  return {
    plannedPerWeek: planned,
    completedThisWeek: completed,
    percent: Math.min(100, Math.round((completed / planned) * 100)),
  };
}

/** % change of `current` vs `previous` volume; null when there is nothing to compare against. */
export function volumeChangePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round1(((current - previous) / previous) * 100);
}

export type AcwrStatus = "low" | "optimal" | "high";

export function acwrStatus(ratio: number): AcwrStatus {
  if (ratio < 0.8) return "low";
  if (ratio <= 1.3) return "optimal";
  return "high";
}

const LOG_SELECT = {
  sessionId: true,
  exerciseId: true,
  weightKg: true,
  reps: true,
  isWarmup: true,
  loggedAt: true,
  exercise: { select: { name: true, muscleGroup: true } },
} as const;

export async function getTrainingAnalytics(userId: string, query: AnalyticsQuery) {
  const weeksCount = Number(query.range.replace("w", ""));
  const now = new Date();
  const thisWeek = startOfUtcWeek(now);
  const rangeStart = new Date(thisWeek.getTime() - (weeksCount - 1) * WEEK_MS);
  // ACWR needs a rolling 28d window regardless of the range requested.
  const fetchFrom = new Date(Math.min(rangeStart.getTime(), now.getTime() - 28 * DAY_MS));

  const prevStart = new Date(rangeStart.getTime() - weeksCount * WEEK_MS);
  const [logRows, sessionRows, prRows, prevRows, profile, thisWeekSessions] = await Promise.all([
    prisma.exerciseSetLog.findMany({
      where: { session: { userId }, loggedAt: { gte: fetchFrom } },
      select: LOG_SELECT,
    }),
    prisma.workoutSession.findMany({
      where: { userId, status: "completed", startedAt: { gte: rangeStart } },
      select: { startedAt: true },
    }),
    prisma.exerciseSetLog.findMany({
      where: { session: { userId }, weightKg: { not: null }, isWarmup: false },
      select: LOG_SELECT,
    }),
    prisma.exerciseSetLog.findMany({
      where: { session: { userId }, loggedAt: { gte: prevStart, lt: rangeStart } },
      select: { weightKg: true, reps: true, isWarmup: true },
    }),
    prisma.onboardingProfile.findUnique({
      where: { userId },
      select: { trainingDaysPerWeek: true, preferredTrainingDays: true },
    }),
    prisma.workoutSession.count({ where: { userId, status: "completed", startedAt: { gte: thisWeek } } }),
  ]);
  const logs = (logRows as LogRow[]).filter((l) => !l.isWarmup);

  // Weekly buckets (oldest -> newest), always `weeksCount` entries.
  const weeks = Array.from({ length: weeksCount }, (_, i) => ({
    weekStart: new Date(rangeStart.getTime() + i * WEEK_MS).toISOString().slice(0, 10),
    volumeKg: 0,
    sets: 0,
    sessions: 0,
  }));
  const bucketIndex = (d: Date) => Math.floor((startOfUtcWeek(d).getTime() - rangeStart.getTime()) / WEEK_MS);

  const inRange = logs.filter((l) => l.loggedAt >= rangeStart);
  for (const l of inRange) {
    const i = bucketIndex(l.loggedAt);
    if (i < 0 || i >= weeksCount) continue;
    weeks[i].volumeKg += volumeOf(l);
    weeks[i].sets += 1;
  }
  for (const s of sessionRows as Array<{ startedAt: Date }>) {
    const i = bucketIndex(s.startedAt);
    if (i >= 0 && i < weeksCount) weeks[i].sessions += 1;
  }
  for (const w of weeks) w.volumeKg = round1(w.volumeKg);

  // ACWR: acute = last 7d load, chronic = mean weekly load over last 28d.
  const acuteFrom = now.getTime() - 7 * DAY_MS;
  const chronicFrom = now.getTime() - 28 * DAY_MS;
  let acute = 0;
  let chronicTotal = 0;
  let earliest = Infinity;
  for (const l of logs) {
    const t = l.loggedAt.getTime();
    if (t < chronicFrom) continue;
    earliest = Math.min(earliest, t);
    const v = volumeOf(l);
    chronicTotal += v;
    if (t >= acuteFrom) acute += v;
  }
  const chronic = chronicTotal / 4;
  // Need at least ~2 weeks of history and some chronic load to be meaningful.
  const acwr =
    earliest <= now.getTime() - 14 * DAY_MS && chronic > 0
      ? {
          acuteLoad: round1(acute),
          chronicLoad: round1(chronic),
          ratio: Math.round((acute / chronic) * 100) / 100,
          status: acwrStatus(acute / chronic),
        }
      : null;

  // Muscle-group distribution within the requested range, by working sets.
  const byMuscle = new Map<string, { sets: number; volumeKg: number }>();
  for (const l of inRange) {
    const m = byMuscle.get(l.exercise.muscleGroup) ?? { sets: 0, volumeKg: 0 };
    m.sets += 1;
    m.volumeKg += volumeOf(l);
    byMuscle.set(l.exercise.muscleGroup, m);
  }
  const totalSets = inRange.length;
  const muscleDistribution = [...byMuscle.entries()]
    .map(([muscleGroup, m]) => ({
      muscleGroup,
      sets: m.sets,
      volumeKg: round1(m.volumeKg),
      percent: Math.round((m.sets / totalSets) * 1000) / 10,
    }))
    .sort((a, b) => b.sets - a.sets);

  // PRs: heaviest working set per exercise, all-time; ties keep the earliest.
  const best = new Map<string, LogRow>();
  for (const l of prRows as LogRow[]) {
    const cur = best.get(l.exerciseId);
    const w = l.weightKg as number;
    if (!cur || w > (cur.weightKg as number) || (w === cur.weightKg && l.loggedAt < cur.loggedAt)) {
      best.set(l.exerciseId, l);
    }
  }
  const personalRecords = [...best.values()]
    .map((l) => ({
      exerciseId: l.exerciseId,
      exerciseName: l.exercise.name,
      muscleGroup: l.exercise.muscleGroup,
      weightKg: l.weightKg as number,
      reps: l.reps,
      achievedAt: l.loggedAt.toISOString(),
    }))
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, 50);

  const currentVolume = weeks.reduce((s, w) => s + w.volumeKg, 0);
  const previousVolume = (prevRows as Array<{ weightKg: number | null; reps: number; isWarmup: boolean }>)
    .filter((l) => !l.isWarmup)
    .reduce((s, l) => s + volumeOf(l), 0);
  const p = profile as { trainingDaysPerWeek: number | null; preferredTrainingDays: string[] } | null;
  const planned = p?.trainingDaysPerWeek ?? (p && p.preferredTrainingDays.length > 0 ? p.preferredTrainingDays.length : null);

  return {
    range: query.range,
    /** % change of this range's volume vs the equally long range before it; null with no earlier volume. */
    volumeChangePercent: volumeChangePercent(currentVolume, previousVolume),
    consistency: weeklyConsistency(planned, thisWeekSessions as number),
    totalSessions: (sessionRows as unknown[]).length,
    totalSets,
    totalVolumeKg: round1(weeks.reduce((s, w) => s + w.volumeKg, 0)),
    weeks,
    acwr,
    muscleDistribution,
    personalRecords,
  };
}
