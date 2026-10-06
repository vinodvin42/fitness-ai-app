/**
 * Pure helpers behind GET /programs/:id/progress (Figma Programs 02/03) and
 * GET /programs/mine. Nothing here is stored - every value is derived from
 * the user's real sessions, onboarding availability and measurement logs.
 *
 * Definitions (documented because the schema has no week/day on Workout):
 *  - Program week n = [startedAt + (n-1)*7d, +7d), where startedAt is the
 *    first WorkoutSession. n is capped at the program's durationWeeks.
 *  - plannedPerWeek = min(workout count, the user's trainingDaysPerWeek, else
 *    their preferred-days count, else the workout count).
 *  - This week's schedule: the program's workouts in order, rotated by
 *    (n-1)*plannedPerWeek, first `plannedPerWeek` of them, assigned in order
 *    to the user's preferred training days (Mon..Sun); with no preferred days
 *    set the day is null. A row is done when that workout has a completed
 *    session inside the week window.
 *  - Adherence = completed sessions / (plannedPerWeek x weeks spanned between
 *    first session and completion/now, at least 1, at most durationWeeks).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export function currentProgramWeek(startedAt: Date, durationWeeks: number, now: Date): number {
  const week = Math.floor((now.getTime() - startedAt.getTime()) / WEEK_MS) + 1;
  return Math.max(1, Math.min(Math.max(1, durationWeeks), week));
}

export function programWeekWindow(startedAt: Date, weekNumber: number): { start: Date; end: Date } {
  const start = new Date(startedAt.getTime() + (weekNumber - 1) * WEEK_MS);
  return { start, end: new Date(start.getTime() + WEEK_MS) };
}

export function plannedPerWeek(totalWorkouts: number, trainingDaysPerWeek: number | null, preferredDaysCount: number): number {
  if (totalWorkouts <= 0) return 0;
  const available =
    trainingDaysPerWeek && trainingDaysPerWeek > 0 ? trainingDaysPerWeek : preferredDaysCount > 0 ? preferredDaysCount : totalWorkouts;
  return Math.min(totalWorkouts, available);
}

export interface WeekScheduleItem {
  workoutId: string;
  name: string;
  day: DayKey | null;
  done: boolean;
}

export function buildWeekSchedule(
  workouts: Array<{ id: string; name: string }>,
  planned: number,
  weekNumber: number,
  preferredDays: string[],
  doneWorkoutIds: Set<string>,
): WeekScheduleItem[] {
  if (workouts.length === 0 || planned <= 0) return [];
  const days = DAY_KEYS.filter((d) => preferredDays.includes(d));
  const offset = ((weekNumber - 1) * planned) % workouts.length;
  const items: WeekScheduleItem[] = [];
  for (let i = 0; i < planned; i += 1) {
    const w = workouts[(offset + i) % workouts.length];
    items.push({ workoutId: w.id, name: w.name, day: days[i] ?? null, done: doneWorkoutIds.has(w.id) });
  }
  return items;
}

export function computeAdherencePercent(
  completedSessions: number,
  planned: number,
  startedAt: Date,
  endAt: Date,
  durationWeeks: number,
): number | null {
  if (completedSessions <= 0 || planned <= 0) return null;
  const weeks = Math.max(1, Math.min(Math.max(1, durationWeeks), Math.ceil((endAt.getTime() - startedAt.getTime()) / WEEK_MS)));
  return Math.min(100, Math.round((completedSessions / (planned * weeks)) * 100));
}

/** First vs last non-null value of `field` in an ascending-by-time list; null unless two entries exist. */
export function pickMeasurementChange(
  rows: Array<Record<string, unknown>>,
  field: string,
): { start: number; current: number } | null {
  const values: number[] = [];
  for (const r of rows) {
    const v = r[field];
    if (typeof v === "number") values.push(v);
  }
  if (values.length < 2) return null;
  return { start: values[0], current: values[values.length - 1] };
}
