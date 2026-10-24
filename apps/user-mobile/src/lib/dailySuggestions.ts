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
 * - "Lighter week" (Figma progress/07, 24 Oct 2026): only with Workout settings
 *   › "Suggest lighter weeks" on, and only after LIGHT_WEEK_HARD_WEEKS full
 *   weeks in a row that each had at least LIGHT_WEEK_MIN_SESSIONS completed
 *   workouts and at least one rated "Hard" (the after-workout "How did it
 *   feel?"). Offered for the coming Monday (today, on a Monday); not again for
 *   LIGHT_WEEK_COOLDOWN_DAYS after a light-week decision either way.
 * - A suggestion decided today is not shown again today; a skipped kind stays
 *   hidden for the rest of that ISO week.
 * - Mode: "ask" (default) every day, "weekly" Sundays only, "off" never.
 */

export type SuggestionMode = "ask" | "weekly" | "off";
export type SuggestionKind = "lighter_day" | "switch_program" | "light_week";

/** Shown for older decisions saved before titles were stored (Decision history). */
export const SUGGESTION_KIND_TITLE: Record<SuggestionKind, string> = {
  lighter_day: "Go lighter today",
  switch_program: "Switch program",
  light_week: "Lighter week",
};
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
  /** What was suggested and why, and when it was decided (Decision history, 24 Oct 2026). Optional: older entries lack them. */
  title?: string;
  why?: string;
  at?: string;
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
  /** Workout settings › Suggest lighter weeks, and completed sessions with their "How did it feel?". */
  lightWeek?: { enabled: boolean; sessions: ReadonlyArray<{ completedAt: string; feel: "easy" | "about_right" | "hard" | null }> };
}

export const MAX_PER_DAY = 2;
export const HARD_EFFORT_RPE = 8;
export const LIGHT_WEEK_HARD_WEEKS = 4;
export const LIGHT_WEEK_MIN_SESSIONS = 2;
export const LIGHT_WEEK_COOLDOWN_DAYS = 28;
/** How long decisions are kept on the phone (Decision history). */
export const HISTORY_DAYS = 90;
const HISTORY_MAX = 200;
const RECENT_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 26 Oct". */
export function shortDay(d: Date): string {
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Local midnight of the Monday of `d`'s week. */
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const parseLocal = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

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

  if (input.lightWeek?.enabled) {
    const offer = lightWeekOffer(now, input.lightWeek.sessions, input.decisions);
    if (offer) out.push(offer);
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

/** The "Lighter week" suggestion, or null when its rule doesn't fire (see the rules above). */
export function lightWeekOffer(
  now: Date,
  sessions: NonNullable<SuggestionInputs["lightWeek"]>["sessions"],
  decisions: readonly SuggestionDecision[],
): DailySuggestion | null {
  const cooldownFrom = localDate(new Date(now.getTime() - LIGHT_WEEK_COOLDOWN_DAYS * DAY_MS));
  if (decisions.some((d) => d.kind === "light_week" && d.date >= cooldownFrom)) return null;
  const thisMonday = mondayOf(now);
  for (let i = 1; i <= LIGHT_WEEK_HARD_WEEKS; i++) {
    const from = addDays(thisMonday, -7 * i).getTime();
    const to = addDays(thisMonday, -7 * (i - 1)).getTime();
    const week = sessions.filter((s) => {
      const t = new Date(s.completedAt).getTime();
      return t >= from && t < to;
    });
    if (week.length < LIGHT_WEEK_MIN_SESSIONS || !week.some((s) => s.feel === "hard")) return null;
  }
  const start = now.getDay() === 1 ? thisMonday : addDays(thisMonday, 7);
  return {
    key: `light_week:${localDate(start)}`,
    kind: "light_week",
    title: `Lighter week from ${shortDay(start)}`,
    why: `You rated at least one workout Hard in each of the last ${LIGHT_WEEK_HARD_WEEKS} weeks.`,
    details: [
      { label: "Week", value: `${shortDay(start)} – ${shortDay(addDays(start, 6))}` },
      { label: "Try", value: "Lighter weights or fewer sets" },
      { label: "Your plan", value: "Unchanged" },
    ],
  };
}

/** The lighter week the member said yes to, while it runs (Mon–Sun), else null. */
export function activeLightWeek(decisions: readonly SuggestionDecision[], now: Date): { start: Date; end: Date } | null {
  const today = localDate(now);
  for (const d of decisions) {
    if (d.kind !== "light_week" || d.outcome !== "used") continue;
    const startKey = d.key.split(":")[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey ?? "")) continue;
    const start = parseLocal(startKey);
    const end = addDays(start, 6);
    if (today >= startKey && today <= localDate(end)) return { start, end };
  }
  return null;
}

/** Keeps HISTORY_DAYS of decisions (the week and light-week rules need 28), newest HISTORY_MAX at most. */
export function pruneDecisions(decisions: readonly SuggestionDecision[], now: Date): SuggestionDecision[] {
  const cutoff = localDate(new Date(now.getTime() - HISTORY_DAYS * DAY_MS));
  return decisions.filter((d) => d.date >= cutoff).slice(-HISTORY_MAX);
}
