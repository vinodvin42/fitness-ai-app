/**
 * Daily review rules (Figma "02b — Today · Suggestions & fewer decisions",
 * owner-approved 7a, 18 Oct 2026). Pure, so the rules can be checked without
 * React. Everything comes from data the app already has; nothing here changes
 * the user's plan on its own.
 *
 * - At most MAX_PER_DAY suggestions, and only when a trigger fires.
 * - "Go lighter today": today is a training day, nothing done yet, and either
 *   the last completed session (within 48 h) averaged RPE >= 8, or today's
 *   readiness band is `rest` (the API's documented formula).
 * - "Switch program": only an already-generated, still-active switch_program
 *   Recommendation (never generated here).
 * - A suggestion decided today is not shown again today; a skipped kind stays
 *   hidden for the rest of that ISO week.
 * - Mode: "ask" (default) every day, "weekly" Sundays only, "off" never.
 */

export type SuggestionMode = "ask" | "weekly" | "off";
export type SuggestionKind = "lighter_day" | "switch_program";
export type SuggestionOutcome = "used" | "skipped";

export interface DailySuggestion {
  key: string;
  kind: SuggestionKind;
  title: string;
  /** One line, naming the real trigger. */
  why: string;
  details: Array<{ label: string; value: string }>;
  recommendationId?: string;
}

export interface SuggestionDecision {
  key: string;
  kind: SuggestionKind;
  /** Local YYYY-MM-DD the decision was made. */
  date: string;
  outcome: SuggestionOutcome;
}

export interface SuggestionInputs {
  now: Date;
  mode: SuggestionMode;
  decisions: readonly SuggestionDecision[];
  /** User's training days (mon..sun); empty = not set. */
  trainingDays: readonly string[];
  nextWorkoutName: string | null;
  /** A session already completed or in progress today. */
  trainedToday: boolean;
  lastCompleted: { completedAt: string; workoutName: string; avgRpe: number | null } | null;
  readiness: { band: "ready" | "moderate" | "rest" | null; score: number | null } | null;
  recommendation: {
    id: string;
    kind: string;
    status: string;
    suggestedProgramName: string | null;
    rationale: string;
  } | null;
  /** The routine "Go lighter" offers instead, e.g. "Shoulder & hamstring mobility · 8 min". */
  lighterRoutineLabel: string;
}

export const MAX_PER_DAY = 2;
export const HARD_EFFORT_RPE = 8;
const RECENT_MS = 48 * 60 * 60 * 1000;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO-8601 week key ("2026-W43") of a local date string. */
export function isoWeekKey(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Average logged RPE of working sets (warm-ups and sets without RPE ignored); null when none. */
export function averageRpe(sets: ReadonlyArray<{ rpe: number | null; isWarmup?: boolean }>): number | null {
  const v = sets.filter((s) => !s.isWarmup && s.rpe != null).map((s) => s.rpe as number);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

function hidden(s: DailySuggestion, today: string, decisions: readonly SuggestionDecision[]): boolean {
  const week = isoWeekKey(today);
  return decisions.some(
    (d) => (d.date === today && d.key === s.key) || (d.outcome === "skipped" && d.kind === s.kind && isoWeekKey(d.date) === week),
  );
}

export function computeDailySuggestions(input: SuggestionInputs): DailySuggestion[] {
  const { now } = input;
  if (input.mode === "off") return [];
  if (input.mode === "weekly" && now.getDay() !== 0) return [];
  const today = localDate(now);
  const out: DailySuggestion[] = [];

  const isTrainingDay =
    !input.trainedToday &&
    !!input.nextWorkoutName &&
    (input.trainingDays.length === 0 || input.trainingDays.includes(DAY_KEYS[now.getDay()]));
  if (isTrainingDay) {
    const last = input.lastCompleted;
    const recentHard =
      last && last.avgRpe != null && last.avgRpe >= HARD_EFFORT_RPE && now.getTime() - new Date(last.completedAt).getTime() <= RECENT_MS;
    const lowReadiness = input.readiness?.band === "rest";
    if (recentHard || lowReadiness) {
      const weekday = last ? new Date(last.completedAt).toLocaleDateString(undefined, { weekday: "short" }) : "";
      out.push({
        key: `lighter_day:${today}`,
        kind: "lighter_day",
        title: "Go lighter today",
        why: recentHard
          ? `You logged an average effort of RPE ${last!.avgRpe} on ${weekday} (${last!.workoutName}).`
          : input.readiness?.score != null
            ? `Your recovery score is ${input.readiness.score} today.`
            : "Your recovery looks low today.",
        details: [
          { label: "Instead of", value: input.nextWorkoutName as string },
          { label: "Try", value: input.lighterRoutineLabel },
          { label: "Your plan", value: "Unchanged" },
        ],
      });
    }
  }

  const rec = input.recommendation;
  if (rec && rec.status === "active" && rec.kind === "switch_program" && rec.suggestedProgramName) {
    const firstSentence = /^(.*?[.!?])(\s|$)/.exec(rec.rationale.trim())?.[1] ?? rec.rationale.trim();
    out.push({
      key: `switch_program:${rec.id}`,
      kind: "switch_program",
      title: `Switch to ${rec.suggestedProgramName}`,
      why: firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}…` : firstSentence,
      details: [{ label: "New program", value: rec.suggestedProgramName }],
      recommendationId: rec.id,
    });
  }

  return out.filter((s) => !hidden(s, today, input.decisions)).slice(0, MAX_PER_DAY);
}

/** Keeps the last 14 days of decisions (enough for the week rule). */
export function pruneDecisions(decisions: readonly SuggestionDecision[], now: Date): SuggestionDecision[] {
  const cutoff = localDate(new Date(now.getTime() - 14 * 86_400_000));
  return decisions.filter((d) => d.date >= cutoff);
}
