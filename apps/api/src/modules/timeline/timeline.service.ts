import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { HEALTH_DISCLAIMER } from "../progress/progressAnalytics.service";
import {
  consecutiveRuns,
  leanMassKg,
  liftProgressByExercise,
  nextLoadTarget,
  percentChange,
  round1,
  type LiftSession,
} from "../progress/progressMetrics";

/**
 * Timeline (docs/mobile/03-screen-inventory.md §G, Figma Progress 08-11).
 * A "milestone spine" computed live from rows the user logged - nothing is
 * stored and nothing is invented:
 *  - strength: every session in which an exercise's heaviest weight improved
 *    (the first ever lift is the baseline entry), plus workout-count
 *    milestones and program completions - from ExerciseSetLog/WorkoutSession.
 *  - body: weight changes of >= 1 kg and waist changes of >= 2 cm since the
 *    last reported anchor - from BodyMeasurement.
 *  - cardio: each time the user's longest run / ride improved - ActivityLog.
 *  - recovery: runs of >= 7 consecutive nights of >= 7 h sleep - RecoveryLog.
 *  - health: resting heart rate down >= 3 bpm between the first and latest week of readings.
 *  - life: account creation ("Started your journey").
 * Every event is "measured" (typed by the user or synced from a device);
 * "estimated" is used only by the Journey Report for derived values (lean
 * mass). Events have synthetic stable ids; the client passes the whole event
 * through navigation rather than re-fetching one.
 */

export type TimelineEventType =
  | "pr"
  | "milestone"
  | "program_complete"
  | "weight"
  | "measurement"
  | "cardio"
  | "recovery"
  | "health"
  | "start";
export type TimelineCategory = "strength" | "cardio" | "body" | "health" | "recovery" | "life";
export type Evidence = "measured" | "estimated";

export interface TimelineProgressionPoint {
  value: number;
  reps: number | null;
  at: Date;
}

export interface TimelineProgression {
  unit: "kg" | "km";
  first: TimelineProgressionPoint;
  previous: TimelineProgressionPoint | null;
  current: TimelineProgressionPoint;
  /** % change of current vs previous (or vs first when there is no previous). */
  percentChange: number | null;
  /** Rule-based next target (+5% load, strength only). */
  nextTarget: number | null;
}

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  category: TimelineCategory;
  evidence: Evidence;
  title: string;
  detail: string;
  occurredAt: Date;
  /** Where the number came from, e.g. "Workout log". */
  source: string;
  /** Exercise / program context, e.g. "Bench Press · Hypertrophy Builder". */
  context: string | null;
  progression: TimelineProgression | null;
}

const WORKOUT_COUNT_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 500];
const DAY_MS = 24 * 60 * 60 * 1000;

const kg = (n: number) => `${round1(n)} kg`;
const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface SessionRow {
  id: string;
  workoutId: string;
  startedAt: Date;
  completedAt: Date | null;
  workout: { id: string; name: string; programId: string; program: { id: string; name: string; workouts: Array<{ id: string }> } };
}

interface SetRow {
  exerciseId: string;
  sessionId: string;
  weightKg: number | null;
  reps: number;
  loggedAt: Date;
  exercise: { name: string };
}

interface MeasureRow {
  weightKg: number | null;
  waistCm: number | null;
  bodyFatPercent: number | null;
  source: string;
  deviceName: string | null;
  loggedAt: Date;
}

interface RecoveryRow {
  date: Date;
  sleepHours: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  soreness: number | null;
  energyLevel: number | null;
  activeMinutes: number | null;
}

interface ActivityRow {
  kind: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
}

interface JourneyData {
  user: { fullName: string; createdAt: Date };
  profile: { weightKg: number | null; targetWeightKg: number | null; trainingDaysPerWeek: number | null; preferredTrainingDays: string[] } | null;
  sessions: SessionRow[];
  sets: SetRow[];
  measures: MeasureRow[];
  recovery: RecoveryRow[];
  activities: ActivityRow[];
  photoDates: Date[];
  checkIns: Array<{ energy: number; soreness: number; createdAt: Date }>;
}

async function loadJourneyData(userId: string): Promise<JourneyData> {
  const [user, profile, sessions, sets, measures, recovery, activities, photos, checkIns] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, createdAt: true } }),
    prisma.onboardingProfile.findUnique({
      where: { userId },
      select: { weightKg: true, targetWeightKg: true, trainingDaysPerWeek: true, preferredTrainingDays: true },
    }),
    prisma.workoutSession.findMany({
      where: { userId, status: "completed" },
      include: {
        workout: {
          select: {
            id: true,
            name: true,
            programId: true,
            program: { select: { id: true, name: true, workouts: { select: { id: true } } } },
          },
        },
      },
      orderBy: { completedAt: "asc" },
    }),
    prisma.exerciseSetLog.findMany({
      where: { session: { userId }, weightKg: { not: null } },
      select: {
        exerciseId: true,
        sessionId: true,
        weightKg: true,
        reps: true,
        loggedAt: true,
        exercise: { select: { name: true } },
      },
      orderBy: { loggedAt: "asc" },
    }),
    prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { loggedAt: "asc" } }),
    prisma.recoveryLog.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.activityLog.findMany({ where: { userId }, orderBy: { startedAt: "asc" } }),
    prisma.progressPhoto.findMany({ where: { userId }, select: { takenAt: true } }),
    prisma.checkIn.findMany({ where: { userId }, select: { energy: true, soreness: true, createdAt: true } }),
  ]);
  if (!user) throw new ApiHttpError(404, "user_not_found", "User not found");
  return {
    user: { fullName: user.fullName as string, createdAt: user.createdAt as Date },
    profile: profile
      ? {
          weightKg: profile.weightKg as number | null,
          targetWeightKg: profile.targetWeightKg as number | null,
          trainingDaysPerWeek: profile.trainingDaysPerWeek as number | null,
          preferredTrainingDays: profile.preferredTrainingDays as string[],
        }
      : null,
    sessions: sessions as SessionRow[],
    sets: sets as SetRow[],
    measures: measures as MeasureRow[],
    recovery: recovery as RecoveryRow[],
    activities: activities as ActivityRow[],
    photoDates: (photos as Array<{ takenAt: Date }>).map((p) => p.takenAt),
    checkIns: checkIns as JourneyData["checkIns"],
  };
}

function liftsOf(data: JourneyData) {
  const lifts: LiftSession[] = data.sets
    .filter((s) => s.weightKg != null)
    .map((s) => ({
      exerciseId: s.exerciseId,
      exerciseName: s.exercise.name,
      at: s.loggedAt,
      weightKg: s.weightKg as number,
      reps: s.reps,
      sessionId: s.sessionId,
    }));
  return liftProgressByExercise(lifts);
}

function buildEvents(data: JourneyData): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const goal = data.profile?.targetWeightKg ?? null;
  const sessionById = new Map(data.sessions.map((s) => [s.id, s]));

  // ---- Strength: personal records -----------------------------------
  for (const lift of liftsOf(data)) {
    lift.improvements.forEach((imp, i) => {
      const session = sessionById.get(imp.sessionId);
      const programName = session?.workout.program.name;
      const first = lift.improvements[0];
      const prev = imp.previous;
      events.push({
        id: `pr:${lift.exerciseId}:${imp.sessionId}`,
        type: "pr",
        category: "strength",
        evidence: "measured",
        title: `${lift.exerciseName} — ${imp.weightKg}kg × ${imp.reps}`,
        detail: prev
          ? `Previous: ${prev.weightKg}kg × ${prev.reps} (${percentChange(prev.weightKg, imp.weightKg)! > 0 ? "+" : ""}${percentChange(prev.weightKg, imp.weightKg)}%)`
          : "First logged lift - your starting point.",
        occurredAt: imp.at,
        source: "Workout log",
        context: [session?.workout.name, programName].filter(Boolean).join(" · ") || null,
        progression: {
          unit: "kg",
          first: { value: first.weightKg, reps: first.reps, at: first.at },
          previous: prev ? { value: prev.weightKg, reps: prev.reps, at: prev.at } : null,
          current: { value: imp.weightKg, reps: imp.reps, at: imp.at },
          percentChange: prev ? percentChange(prev.weightKg, imp.weightKg) : null,
          nextTarget: i === lift.improvements.length - 1 ? nextLoadTarget(imp.weightKg) : null,
        },
      });
    });
  }

  // ---- Strength: workout-count milestones + program completions ------
  const trackers = new Map<string, { name: string; total: number; done: Set<string>; at: Date | null }>();
  data.sessions.forEach((session, idx) => {
    const count = idx + 1;
    if (WORKOUT_COUNT_MILESTONES.includes(count) && session.completedAt) {
      events.push({
        id: `milestone:${count}`,
        type: "milestone",
        category: "strength",
        evidence: "measured",
        title: `${count} workouts completed`,
        detail: `You've logged ${count} completed workouts.`,
        occurredAt: session.completedAt,
        source: "Workout log",
        context: null,
        progression: null,
      });
    }
    const t = trackers.get(session.workout.programId) ?? {
      name: session.workout.program.name,
      total: session.workout.program.workouts.length,
      done: new Set<string>(),
      at: null,
    };
    t.done.add(session.workoutId);
    if (!t.at && t.total > 0 && t.done.size === t.total) t.at = session.completedAt;
    trackers.set(session.workout.programId, t);
  });
  for (const [programId, t] of trackers) {
    if (t.at) {
      events.push({
        id: `program_complete:${programId}`,
        type: "program_complete",
        category: "strength",
        evidence: "measured",
        title: `Completed ${t.name}`,
        detail: `All ${t.total} workouts finished.`,
        occurredAt: t.at,
        source: "Workout log",
        context: t.name,
        progression: null,
      });
    }
  }

  // ---- Body: weight (>= 1 kg since the last anchor) and waist (>= 2 cm) ----
  let weightAnchor: number | null = null;
  const firstWeight = data.measures.find((m) => m.weightKg != null)?.weightKg ?? null;
  for (const m of data.measures) {
    if (m.weightKg == null) continue;
    if (weightAnchor == null) {
      weightAnchor = m.weightKg;
      continue;
    }
    if (Math.abs(m.weightKg - weightAnchor) >= 1) {
      weightAnchor = m.weightKg;
      events.push({
        id: `weight:${m.loggedAt.toISOString()}`,
        type: "weight",
        category: "body",
        evidence: "measured",
        title: `Weight log — ${kg(m.weightKg)}`,
        detail: `Start: ${kg(firstWeight as number)}${goal != null ? ` · Goal: ${kg(goal)}` : ""}`,
        occurredAt: m.loggedAt,
        source: m.source === "device" ? `Smart scale${m.deviceName ? ` (${m.deviceName})` : ""}` : "Weight log",
        context: null,
        progression: null,
      });
    }
  }
  let waistAnchor: number | null = null;
  for (const m of data.measures) {
    if (m.waistCm == null) continue;
    if (waistAnchor == null) {
      waistAnchor = m.waistCm;
      continue;
    }
    if (Math.abs(m.waistCm - waistAnchor) >= 2) {
      const delta = round1(m.waistCm - waistAnchor);
      events.push({
        id: `waist:${m.loggedAt.toISOString()}`,
        type: "measurement",
        category: "body",
        evidence: "measured",
        title: `Waist ${delta < 0 ? "down" : "up"} ${Math.abs(delta)} cm`,
        detail: `Now ${m.waistCm} cm (was ${waistAnchor} cm at the last milestone).`,
        occurredAt: m.loggedAt,
        source: "Measurement log",
        context: null,
        progression: null,
      });
      waistAnchor = m.waistCm;
    }
  }

  // ---- Cardio: longest run / ride improvements -----------------------
  for (const kind of ["run", "ride"] as const) {
    let best: ActivityRow | null = null;
    for (const a of data.activities.filter((x) => x.kind === kind)) {
      if (!best || a.distanceMeters > best.distanceMeters) {
        const km = round1(a.distanceMeters / 1000);
        const label = kind === "run" ? "run" : "ride";
        events.push({
          id: `cardio:${kind}:${a.startedAt.toISOString()}`,
          type: "cardio",
          category: "cardio",
          evidence: "measured",
          title: best ? `Longest ${label} — ${km} km` : `First ${label} logged — ${km} km`,
          detail: best
            ? `Previous best: ${round1(best.distanceMeters / 1000)} km`
            : `${Math.round(a.durationSeconds / 60)} min - your starting point.`,
          occurredAt: a.startedAt,
          source: "Activity log",
          context: null,
          progression: {
            unit: "km",
            first: { value: 0, reps: null, at: a.startedAt },
            previous: best ? { value: round1(best.distanceMeters / 1000), reps: null, at: best.startedAt } : null,
            current: { value: km, reps: null, at: a.startedAt },
            percentChange: best ? percentChange(best.distanceMeters / 1000, km) : null,
            nextTarget: null,
          },
        });
        best = a;
      }
    }
  }

  // ---- Recovery: >= 7 consecutive nights of >= 7 h sleep ---------------
  const sleepRuns = consecutiveRuns(
    data.recovery.filter((r) => r.sleepHours != null).map((r) => ({ date: r.date, value: r.sleepHours as number })),
    (v) => v >= 7,
    7,
  );
  for (const run of sleepRuns) {
    events.push({
      id: `recovery:sleep:${run.start.toISOString().slice(0, 10)}`,
      type: "recovery",
      category: "recovery",
      evidence: "measured",
      title: `${run.length} nights of 7h+ sleep`,
      detail: `${run.length} consecutive days averaging ${run.avg} h.`,
      occurredAt: new Date(run.start.getTime() + 6 * DAY_MS),
      source: "Sleep log",
      context: null,
      progression: null,
    });
  }

  // ---- Health: resting heart rate, first reading week vs latest week ----
  const rhr = data.recovery.filter((r) => r.restingHeartRate != null);
  if (rhr.length >= 6) {
    const firstWeek = rhr.filter((r) => r.date.getTime() - rhr[0].date.getTime() < 7 * DAY_MS);
    const last = rhr[rhr.length - 1];
    const lastWeek = rhr.filter((r) => last.date.getTime() - r.date.getTime() < 7 * DAY_MS);
    const avg = (a: RecoveryRow[]) => a.reduce((s, x) => s + (x.restingHeartRate as number), 0) / a.length;
    if (firstWeek.length >= 3 && lastWeek.length >= 3 && lastWeek[0].date.getTime() > firstWeek[firstWeek.length - 1].date.getTime()) {
      const a = Math.round(avg(firstWeek));
      const b = Math.round(avg(lastWeek));
      if (a - b >= 3) {
        events.push({
          id: `health:rhr:${last.date.toISOString().slice(0, 10)}`,
          type: "health",
          category: "health",
          evidence: "measured",
          title: `Resting heart rate — ${b} bpm`,
          detail: `Down from ${a} bpm in your first logged week.`,
          occurredAt: last.date,
          source: "Recovery log",
          context: null,
          progression: null,
        });
      }
    }
  }

  // ---- Life: account start ------------------------------------------
  events.push({
    id: "start",
    type: "start",
    category: "life",
    evidence: "measured",
    title: "Started your journey",
    detail: firstWeight != null ? `Baseline weight: ${kg(firstWeight)}` : "Welcome to 23PrimeFit.",
    occurredAt: data.user.createdAt,
    source: "Account",
    context: null,
    progression: null,
  });

  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return events;
}

export async function listTimelineEvents(userId: string): Promise<TimelineEvent[]> {
  return buildEvents(await loadJourneyData(userId));
}

function monthsBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0));
}

function periodOf(data: JourneyData, now: Date) {
  return { start: data.user.createdAt, end: now };
}

export async function getTimelineSummary(userId: string, now: Date = new Date()) {
  const data = await loadJourneyData(userId);
  const events = buildEvents(data);
  const { start, end } = periodOf(data, now);
  const weights = data.measures.filter((m) => m.weightKg != null);
  const firstW = weights[0]?.weightKg ?? null;
  const curW = weights.length ? (weights[weights.length - 1].weightKg as number) : null;
  const hasLean = data.measures.some((m) => m.bodyFatPercent != null);

  let insight: string | null = null;
  if (firstW != null && curW != null && weights.length >= 2) {
    const d = round1(curW - firstW);
    insight = `Period: ${fmtDay(start)} to ${fmtDay(end)}. Weight changed from ${kg(firstW)} to ${kg(curW)} (${d > 0 ? "+" : ""}${d} kg).${hasLean ? " Lean mass figures are estimates, not clinical measurements." : ""}`;
  }
  return {
    memberSince: start.toISOString(),
    activeDays: Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS)),
    activeMonths: monthsBetween(start, end),
    milestones: events.filter((e) => e.type !== "start").length,
    insight,
    insightHasMeasured: weights.length >= 2,
    insightHasEstimated: hasLean,
  };
}

export async function getTimelineMonth(userId: string, year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 0 || month > 11) {
    throw new ApiHttpError(400, "invalid_month", "year and month are required (month 0-11)");
  }
  const data = await loadJourneyData(userId);
  const events = buildEvents(data).filter((e) => e.occurredAt.getUTCFullYear() === year && e.occurredAt.getUTCMonth() === month);
  const inMonth = (d: Date) => d.getUTCFullYear() === year && d.getUTCMonth() === month;
  const sessions = data.sessions.filter((s) => inMonth(s.startedAt));
  const sleep = data.recovery.filter((r) => inMonth(r.date) && r.sleepHours != null).map((r) => r.sleepHours as number);
  const prs = events.filter((e) => e.type === "pr" && e.progression?.previous).length;
  const monthWeights = data.measures.filter((m) => inMonth(m.loggedAt) && m.weightKg != null);

  const parts: string[] = [];
  if (sessions.length) parts.push(`${sessions.length} session${sessions.length === 1 ? "" : "s"} logged`);
  if (prs) parts.push(`${prs} personal record${prs === 1 ? "" : "s"}`);
  if (monthWeights.length >= 2) {
    const a = monthWeights[0].weightKg as number;
    const b = monthWeights[monthWeights.length - 1].weightKg as number;
    if (a !== b) parts.push(`weight ${kg(a)} to ${kg(b)}`);
  }
  return {
    year,
    month,
    workouts: sessions.length,
    avgSleepHours: sleep.length >= 3 ? round1(sleep.reduce((s, x) => s + x, 0) / sleep.length) : null,
    sleepNights: sleep.length,
    activeDates: Array.from(new Set(sessions.map((s) => s.startedAt.toISOString().slice(0, 10)))).sort(),
    insight: parts.length ? `${parts.join(", ")}.` : null,
    events,
  };
}

export interface ReportLine {
  text: string;
  evidence: Evidence;
}

export interface ReportSection {
  id: "body" | "strength" | "cardio" | "health" | "consistency";
  title: string;
  lines: ReportLine[];
  /** Shown when the section has no data to report. */
  emptyNote: string;
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

/**
 * Journey Report (Figma Progress 11): a longitudinal summary composed
 * server-side from the same real logs as the timeline. Each line carries a
 * Measured / Estimated tag; sections without data say so instead of padding.
 */
export async function getJourneyReport(userId: string, now: Date = new Date()) {
  const data = await loadJourneyData(userId);
  const events = buildEvents(data);
  const { start, end } = periodOf(data, now);
  const months = monthsBetween(start, end);
  const weeks = Math.max(1, (end.getTime() - start.getTime()) / (7 * DAY_MS));

  // ---- 1. Body composition
  const body: ReportLine[] = [];
  const weights = data.measures.filter((m) => m.weightKg != null);
  if (weights.length >= 2) {
    const a = weights[0].weightKg as number;
    const b = weights[weights.length - 1].weightKg as number;
    const pct = percentChange(a, b);
    body.push({ text: `Weight logs: ${kg(a)} to ${kg(b)} (${b - a > 0 ? "+" : ""}${round1(b - a)} kg${pct != null ? `, ${pct > 0 ? "+" : ""}${pct}%` : ""}).`, evidence: "measured" });
  } else if (weights.length === 1) {
    body.push({ text: `Weight logged once: ${kg(weights[0].weightKg as number)}.`, evidence: "measured" });
  }
  const fats = data.measures.filter((m) => m.bodyFatPercent != null);
  if (fats.length >= 2) {
    body.push({
      text: `Body fat: ${fats[0].bodyFatPercent}% to ${fats[fats.length - 1].bodyFatPercent}% (user or scale entered).`,
      evidence: "measured",
    });
  }
  const weightAt = (at: Date) => [...weights].reverse().find((w) => w.loggedAt.getTime() <= at.getTime())?.weightKg ?? null;
  if (fats.length >= 2) {
    const l0 = leanMassKg(fats[0].weightKg ?? weightAt(fats[0].loggedAt), fats[0].bodyFatPercent);
    const l1 = leanMassKg(fats[fats.length - 1].weightKg ?? weightAt(fats[fats.length - 1].loggedAt), fats[fats.length - 1].bodyFatPercent);
    if (l0 != null && l1 != null) {
      body.push({ text: `Derived lean mass: about ${kg(l0)} to ${kg(l1)} (weight x (1 - body fat %)).`, evidence: "estimated" });
    }
  }
  const waists = data.measures.filter((m) => m.waistCm != null);
  if (waists.length >= 2) {
    body.push({ text: `Waist: ${waists[0].waistCm} cm to ${waists[waists.length - 1].waistCm} cm.`, evidence: "measured" });
  }

  // ---- 2. Strength
  const strength: ReportLine[] = [];
  const volume = data.sets.reduce((s, x) => s + (x.weightKg ? x.weightKg * x.reps : 0), 0);
  if (data.sessions.length) {
    strength.push({
      text: `${data.sessions.length} completed workout${data.sessions.length === 1 ? "" : "s"}${volume > 0 ? `, ${Math.round(volume).toLocaleString("en-US")} kg total volume lifted` : ""}.`,
      evidence: "measured",
    });
  }
  const lifts = liftsOf(data)
    .filter((l) => l.improvements.length >= 2)
    .map((l) => ({ l, gain: percentChange(l.firstKg, l.currentKg) ?? 0 }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  if (lifts.length) {
    strength.push({
      text: `Heaviest sets: ${lifts.map(({ l }) => `${l.exerciseName} ${l.firstKg} to ${l.currentKg} kg`).join(", ")}.`,
      evidence: "measured",
    });
  }

  // ---- 3. Cardio
  const cardio: ReportLine[] = [];
  const runs = data.activities.filter((a) => a.kind === "run");
  const rides = data.activities.filter((a) => a.kind === "ride");
  for (const [label, list] of [["Runs", runs], ["Rides", rides]] as const) {
    if (!list.length) continue;
    const total = list.reduce((s, a) => s + a.distanceMeters, 0) / 1000;
    const longest = Math.max(...list.map((a) => a.distanceMeters)) / 1000;
    cardio.push({ text: `${label}: ${list.length} logged, ${round1(total)} km total, longest ${round1(longest)} km.`, evidence: "measured" });
  }
  const rhr = data.recovery.filter((r) => r.restingHeartRate != null);
  if (rhr.length >= 6) {
    const a = rhr.slice(0, 3).map((r) => r.restingHeartRate as number);
    const b = rhr.slice(-3).map((r) => r.restingHeartRate as number);
    cardio.push({ text: `Resting heart rate: ${Math.round(avg(a))} bpm (first readings) to ${Math.round(avg(b))} bpm (latest).`, evidence: "measured" });
  }

  // ---- 4. Health & recovery
  const health: ReportLine[] = [];
  const sleep = data.recovery.filter((r) => r.sleepHours != null).map((r) => r.sleepHours as number);
  if (sleep.length >= 3) health.push({ text: `Average sleep ${round1(avg(sleep))} h per night across ${sleep.length} logged nights.`, evidence: "measured" });
  const hrv = data.recovery.filter((r) => r.hrvMs != null).map((r) => r.hrvMs as number);
  if (hrv.length >= 6) {
    health.push({ text: `HRV: ${Math.round(avg(hrv.slice(0, 3)))} ms (first readings) to ${Math.round(avg(hrv.slice(-3)))} ms (latest).`, evidence: "measured" });
  }
  const soreness = [...data.recovery.filter((r) => r.soreness != null).map((r) => r.soreness as number), ...data.checkIns.map((c) => c.soreness)];
  if (soreness.length >= 3) health.push({ text: `Average self-reported soreness ${round1(avg(soreness))} out of 5.`, evidence: "measured" });

  // ---- 5. Consistency
  const consistency: ReportLine[] = [];
  if (data.sessions.length) {
    consistency.push({ text: `${data.sessions.length} workouts over ${Math.max(1, Math.round(weeks))} weeks (${round1(data.sessions.length / weeks)} per week).`, evidence: "measured" });
    const planned = data.profile?.trainingDaysPerWeek ?? (data.profile?.preferredTrainingDays.length || null);
    if (planned) {
      const pct = Math.min(100, Math.round((data.sessions.length / (planned * weeks)) * 100));
      consistency.push({ text: `${pct}% of your planned ${planned} sessions per week.`, evidence: "measured" });
    }
  }
  const milestones = events.filter((e) => e.type !== "start").length;
  if (milestones) consistency.push({ text: `${milestones} milestone${milestones === 1 ? "" : "s"} logged.`, evidence: "measured" });
  if (data.photoDates.length) consistency.push({ text: `${data.photoDates.length} progress photo${data.photoDates.length === 1 ? "" : "s"} saved.`, evidence: "measured" });

  const sections: ReportSection[] = [
    { id: "body", title: "Body Composition", lines: body, emptyNote: "Log weight, body fat or tape measurements to fill this section." },
    { id: "strength", title: "Strength Metrics", lines: strength, emptyNote: "Complete workouts with weighted sets to fill this section." },
    { id: "cardio", title: "Cardio Performance", lines: cardio, emptyNote: "Log runs, rides or sync a device to fill this section." },
    { id: "health", title: "Health & Recovery", lines: health, emptyNote: "Log sleep or check in to fill this section." },
    { id: "consistency", title: "Consistency Metrics", lines: consistency, emptyNote: "Complete a workout to fill this section." },
  ];

  const spanLabel = months >= 1 ? `${months}-Month` : `${Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY_MS))}-Day`;
  return {
    generatedAt: end.toISOString(),
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    memberName: data.user.fullName,
    summaryTitle: `${spanLabel} Progress Report for ${data.user.fullName}`,
    sections,
    disclaimer: HEALTH_DISCLAIMER,
  };
}
