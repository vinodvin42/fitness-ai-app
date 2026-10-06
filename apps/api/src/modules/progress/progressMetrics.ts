/**
 * Pure, side-effect-free progress maths (Figma Progress 01/02/07). Nothing
 * here touches the database - the services feed it real logged rows - so
 * every rule is unit-testable and documented in one place. No function
 * invents a value: each returns null when its inputs are missing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface GoalProgress {
  startWeightKg: number;
  currentWeightKg: number;
  /** Null when the user has not set a goal weight (the card renders without a ring). */
  targetWeightKg: number | null;
  /** 0-100, one decimal. Null without a target (or when start equals target). */
  percent: number | null;
  /** kg still to go (never negative). Null without a target. */
  remainingKg: number | null;
  direction: "loss" | "gain" | null;
  startedAt: string;
}

/**
 * Overall Progress % = (start - current) / (start - target), clamped 0-100.
 * Works for loss and gain goals (the signs cancel). `start` is the first
 * weight ever logged (onboarding baseline included); `target` is
 * OnboardingProfile.targetWeightKg. Without a target there is no percent.
 */
export function goalProgress(
  start: { weightKg: number; at: Date } | null,
  currentKg: number | null,
  targetKg: number | null,
): GoalProgress | null {
  if (!start || currentKg == null) return null;
  const base: GoalProgress = {
    startWeightKg: start.weightKg,
    currentWeightKg: currentKg,
    targetWeightKg: targetKg ?? null,
    percent: null,
    remainingKg: null,
    direction: null,
    startedAt: start.at.toISOString(),
  };
  if (targetKg == null || targetKg === start.weightKg) return base;
  const raw = ((start.weightKg - currentKg) / (start.weightKg - targetKg)) * 100;
  const overshot = targetKg < start.weightKg ? currentKg <= targetKg : currentKg >= targetKg;
  return {
    ...base,
    percent: round1(Math.max(0, Math.min(100, raw))),
    remainingKg: overshot ? 0 : round1(Math.abs(currentKg - targetKg)),
    direction: targetKg < start.weightKg ? "loss" : "gain",
  };
}

/** Lean mass = weight x (1 - body-fat%). An ESTIMATE: only when both inputs exist. */
export function leanMassKg(weightKg: number | null, bodyFatPercent: number | null): number | null {
  if (weightKg == null || bodyFatPercent == null) return null;
  return round1(weightKg * (1 - bodyFatPercent / 100));
}

export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

/** WHO adult BMI bands. A population screening label, never a diagnosis. */
export function bmiBand(value: number): "Underweight" | "Healthy range" | "Overweight" | "Obesity range" {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Healthy range";
  if (value < 30) return "Overweight";
  return "Obesity range";
}

export function waistToHip(waistCm: number | null, hipsCm: number | null): number | null {
  if (waistCm == null || hipsCm == null || hipsCm <= 0) return null;
  return round2(waistCm / hipsCm);
}

/** WHO waist-hip cut-offs (men 0.90, women 0.85). Null when gender is unknown / not binary. */
export function whrBand(ratio: number, gender: string | null | undefined): "Healthy range" | "Above WHO threshold" | null {
  const g = (gender ?? "").toLowerCase();
  const limit = g === "male" ? 0.9 : g === "female" ? 0.85 : null;
  if (limit == null) return null;
  return ratio <= limit ? "Healthy range" : "Above WHO threshold";
}

/** Mean of the provided L/R pair (or the single side present); null when neither. */
export function pairMean(a: number | null | undefined, b: number | null | undefined): number | null {
  const v = [a, b].filter((x): x is number => x != null);
  return v.length ? round1(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

function weekKey(d: Date): number {
  // UTC Monday-start week index.
  const day = Math.floor(d.getTime() / DAY_MS);
  return Math.floor((day + 3) / 7);
}

export interface WeighIn {
  weightKg: number;
  loggedAt: Date;
}

export interface PlateauResult {
  weeks: number;
  rangeKg: number;
  weightKg: number;
}

/**
 * Weight-loss plateau rule. Applies only while a loss goal exists (target <
 * first weight) and the goal is not yet reached. Take the last weigh-in of
 * each of the most recent 4 calendar weeks (UTC Monday weeks) that have data;
 * if there are at least 3 such weekly weigh-ins, the newest is within the last
 * 14 days, and the spread between them is <= 0.3 kg, the user is plateaued.
 */
export function detectWeightPlateau(
  weighIns: WeighIn[],
  targetKg: number | null,
  now: Date = new Date(),
): PlateauResult | null {
  if (targetKg == null || weighIns.length < 3) return null;
  const sorted = [...weighIns].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const first = sorted[0].weightKg;
  const current = sorted[sorted.length - 1].weightKg;
  if (!(targetKg < first) || current <= targetKg) return null;

  const byWeek = new Map<number, number>();
  for (const w of sorted) byWeek.set(weekKey(w.loggedAt), w.weightKg); // later entries overwrite: last of the week
  const keys = Array.from(byWeek.keys()).sort((a, b) => a - b);
  const recent = keys.slice(-4);
  // Only weeks inside a 5-week window count as "recent".
  const newest = recent[recent.length - 1];
  const inWindow = recent.filter((k) => newest - k <= 4);
  if (inWindow.length < 3) return null;
  if (now.getTime() - sorted[sorted.length - 1].loggedAt.getTime() > 14 * DAY_MS) return null;
  const vals = inWindow.map((k) => byWeek.get(k) as number);
  const range = Math.max(...vals) - Math.min(...vals);
  if (range > 0.3 + 1e-9) return null;
  return { weeks: inWindow.length, rangeKg: round1(range), weightKg: vals[vals.length - 1] };
}

export interface DatedValue {
  at: Date;
  value: number;
}

export interface WindowCompare {
  recentAvg: number;
  previousAvg: number;
  changePercent: number;
  recentCount: number;
  previousCount: number;
}

/** Last-7-days average vs the 7 days before it. Null unless each window has >= minValues values. */
export function compareWeeks(values: DatedValue[], now: Date = new Date(), minValues = 3): WindowCompare | null {
  const t = now.getTime();
  const recent = values.filter((v) => t - v.at.getTime() >= 0 && t - v.at.getTime() < 7 * DAY_MS).map((v) => v.value);
  const prev = values
    .filter((v) => t - v.at.getTime() >= 7 * DAY_MS && t - v.at.getTime() < 14 * DAY_MS)
    .map((v) => v.value);
  if (recent.length < minValues || prev.length < minValues) return null;
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const r = avg(recent);
  const p = avg(prev);
  if (p === 0) return null;
  return {
    recentAvg: round1(r),
    previousAvg: round1(p),
    changePercent: Math.round(((r - p) / p) * 100),
    recentCount: recent.length,
    previousCount: prev.length,
  };
}

export interface LiftSession {
  exerciseId: string;
  exerciseName: string;
  at: Date;
  weightKg: number;
  reps: number;
  sessionId: string;
}

export interface LiftProgress {
  exerciseId: string;
  exerciseName: string;
  firstKg: number;
  firstReps: number;
  firstAt: Date;
  previousKg: number | null;
  previousReps: number | null;
  previousAt: Date | null;
  currentKg: number;
  currentReps: number;
  currentAt: Date;
  /** Every session in which the heaviest weight improved, oldest first (incl. the first ever lift). */
  improvements: Array<{ at: Date; weightKg: number; reps: number; previous: { weightKg: number; reps: number; at: Date } | null; sessionId: string }>;
}

/**
 * Collapses raw set logs to the best set per (exercise, session), then walks
 * sessions oldest-first recording each one that beat the running heaviest
 * weight. Used by Timeline PR events, Strength insight and the Journey Report,
 * so they all agree with Progress Overview's "heaviest set" PR.
 */
export function liftProgressByExercise(sets: LiftSession[]): LiftProgress[] {
  const bestPerSession = new Map<string, LiftSession>();
  for (const s of sets) {
    const key = `${s.exerciseId}:${s.sessionId}`;
    const cur = bestPerSession.get(key);
    if (!cur || s.weightKg > cur.weightKg || (s.weightKg === cur.weightKg && s.reps > cur.reps)) bestPerSession.set(key, s);
  }
  const byExercise = new Map<string, LiftSession[]>();
  for (const s of bestPerSession.values()) {
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }
  const out: LiftProgress[] = [];
  for (const list of byExercise.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    const improvements: LiftProgress["improvements"] = [];
    let best: LiftSession | null = null;
    for (const s of list) {
      if (!best || s.weightKg > best.weightKg) {
        improvements.push({
          at: s.at,
          weightKg: s.weightKg,
          reps: s.reps,
          previous: best ? { weightKg: best.weightKg, reps: best.reps, at: best.at } : null,
          sessionId: s.sessionId,
        });
        best = s;
      }
    }
    const first = improvements[0];
    const cur = improvements[improvements.length - 1];
    const prev = improvements.length > 1 ? improvements[improvements.length - 2] : null;
    out.push({
      exerciseId: list[0].exerciseId,
      exerciseName: list[0].exerciseName,
      firstKg: first.weightKg,
      firstReps: first.reps,
      firstAt: first.at,
      previousKg: prev?.weightKg ?? null,
      previousReps: prev?.reps ?? null,
      previousAt: prev?.at ?? null,
      currentKg: cur.weightKg,
      currentReps: cur.reps,
      currentAt: cur.at,
      improvements,
    });
  }
  return out;
}

export function percentChange(from: number, to: number): number | null {
  if (!from) return null;
  return round1(((to - from) / from) * 100);
}

/** Next sensible load target: +5% of the current best, rounded to the nearest 0.5 kg. */
export function nextLoadTarget(currentKg: number): number {
  return Math.round(currentKg * 1.05 * 2) / 2;
}

export interface StrengthTrend {
  exerciseName: string;
  fromKg: number;
  toKg: number;
  improvements: number;
  weeks: number;
}

/**
 * Strength trend rule: among lifts that improved their heaviest weight at
 * least twice within the last 8 weeks, pick the one with the largest relative
 * gain. "weeks" is the span between the first and last improvement in the window.
 */
export function strengthTrend(lifts: LiftProgress[], now: Date = new Date()): StrengthTrend | null {
  const cutoff = now.getTime() - 56 * DAY_MS;
  let best: { trend: StrengthTrend; gain: number } | null = null;
  for (const l of lifts) {
    const recent = l.improvements.filter((i) => i.at.getTime() >= cutoff);
    if (recent.length < 2) continue;
    const from = recent[0].previous?.weightKg ?? recent[0].weightKg;
    const to = recent[recent.length - 1].weightKg;
    const gain = percentChange(from, to) ?? 0;
    const weeks = Math.max(1, Math.round((recent[recent.length - 1].at.getTime() - recent[0].at.getTime()) / (7 * DAY_MS)));
    if (!best || gain > best.gain) {
      best = { gain, trend: { exerciseName: l.exerciseName, fromKg: from, toKg: to, improvements: recent.length, weeks } };
    }
  }
  return best?.trend ?? null;
}

/** Longest run of consecutive calendar days (UTC) each satisfying `ok`; returns runs with their length >= minLen. */
export function consecutiveRuns(
  days: Array<{ date: Date; value: number }>,
  ok: (v: number) => boolean,
  minLen: number,
): Array<{ start: Date; end: Date; length: number; avg: number }> {
  const sorted = [...days].filter((d) => ok(d.value)).sort((a, b) => a.date.getTime() - b.date.getTime());
  const runs: Array<{ start: Date; end: Date; length: number; avg: number }> = [];
  let cur: typeof sorted = [];
  const flush = () => {
    if (cur.length >= minLen) {
      runs.push({
        start: cur[0].date,
        end: cur[cur.length - 1].date,
        length: cur.length,
        avg: round1(cur.reduce((s, x) => s + x.value, 0) / cur.length),
      });
    }
    cur = [];
  };
  for (const d of sorted) {
    const last = cur[cur.length - 1];
    if (last && Math.round((d.date.getTime() - last.date.getTime()) / DAY_MS) === 1) cur.push(d);
    else {
      flush();
      cur = [d];
    }
  }
  flush();
  return runs;
}
