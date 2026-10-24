import AsyncStorage from "@react-native-async-storage/async-storage";
import { ML_PER_GLASS } from "./hydration";
import { mlToOz } from "./measureUnits";

/**
 * The Android home-screen widget "Today · Workout · Water · Protein" (Figma
 * widgets/02-android, 4×2). Today writes a small snapshot here whenever its
 * data changes; the widget (src/widget) renders it without starting the UI.
 * The widget never shows another day's numbers: an old snapshot shows
 * "Open Fynrox to update" instead, and signing out deletes it.
 *
 * Kept free of native widget code so tests/todayWidget.check.cjs can run it.
 */
export const TODAY_WIDGET_NAME = "TodayWidget";
export const TODAY_WIDGET_STORAGE_KEY = "fynrox.widget.today.v1";
/** One tap on "+250 ml" logs one glass, the unit water is stored in. */
export const WIDGET_WATER_GLASSES = 1;

export type WidgetWorkoutState = "planned" | "in_progress" | "done" | "rest" | "program_complete" | "none";

export interface TodayWidgetSnapshot {
  version: 1;
  /** Local day the numbers are for, YYYY-MM-DD. */
  date: string;
  updatedAt: string;
  workout: { state: WidgetWorkoutState; name: string | null; time: string | null };
  water: { glasses: number; goalGlasses: number; unit: "ml" | "oz" };
  protein: { leftG: number; targetG: number };
}

export interface TodayWidgetInput {
  now: Date;
  /** Name of the next planned workout, if any. */
  nextWorkoutName: string | null;
  programComplete: boolean;
  inProgressName: string | null;
  completedName: string | null;
  isRestDay: boolean;
  /** Today's workout reminder ("6:00 PM"), if the member set one. */
  workoutTime: string | null;
  waterGlasses: number;
  waterGoalGlasses: number;
  waterUnit: "ml" | "oz";
  proteinLeftG: number;
  proteinTargetG: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const widgetDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Same order as Today's card: a session in progress, then today's finished one, then rest day, then the plan. */
export function buildTodayWidgetSnapshot(input: TodayWidgetInput): TodayWidgetSnapshot {
  let workout: TodayWidgetSnapshot["workout"];
  if (input.inProgressName) workout = { state: "in_progress", name: input.inProgressName, time: null };
  else if (input.completedName) workout = { state: "done", name: input.completedName, time: null };
  else if (input.isRestDay) workout = { state: "rest", name: null, time: null };
  else if (input.nextWorkoutName) workout = { state: "planned", name: input.nextWorkoutName, time: input.workoutTime };
  else if (input.programComplete) workout = { state: "program_complete", name: null, time: null };
  else workout = { state: "none", name: null, time: null };
  return {
    version: 1,
    date: widgetDay(input.now),
    updatedAt: input.now.toISOString(),
    workout,
    water: {
      glasses: Math.max(0, Math.round(input.waterGlasses)),
      goalGlasses: Math.max(1, Math.round(input.waterGoalGlasses)),
      unit: input.waterUnit,
    },
    protein: { leftG: Math.max(0, Math.round(input.proteinLeftG)), targetG: Math.max(0, Math.round(input.proteinTargetG)) },
  };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Today's session state with Today's rules (TodayScreen): a session started
 * today and still open, else the latest one finished today, else a rest day
 * when today isn't one of the member's training days (no days set = no claim).
 */
export function todayWorkoutState(
  history: Array<{ status: string; workoutName: string; startedAt: string; completedAt: string | null }> | undefined,
  trainingDays: string[] | undefined,
  now: Date,
): { inProgressName: string | null; completedName: string | null; isRestDay: boolean } {
  const sameDay = (iso: string) => new Date(iso).toDateString() === now.toDateString();
  const inProgress = (history ?? []).find((h) => h.status === "in_progress" && sameDay(h.startedAt));
  const completed = (history ?? [])
    .filter((h) => h.status === "completed" && h.completedAt && sameDay(h.completedAt))
    .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string))[0];
  const days = trainingDays ?? [];
  return {
    inProgressName: inProgress?.workoutName ?? null,
    completedName: completed?.workoutName ?? null,
    isRestDay: !inProgress && !completed && days.length > 0 && !days.includes(DAY_KEYS[now.getDay()]),
  };
}

/**
 * The time on the Workout row ("Upper Body Strength · 6:00 PM"): the earliest
 * enabled workout reminder set for today. Plans have no time of day, so with no
 * reminder the row shows the name only.
 */
export function workoutReminderTime(
  reminders: Array<{ category: string; hour: number; minute: number; daysOfWeek: number[]; isEnabled: boolean }> | undefined,
  now: Date,
  formatTime: (d: Date) => string,
): string | null {
  const today = now.getDay();
  const first = (reminders ?? [])
    .filter((r) => r.isEnabled && r.category === "workout" && r.daysOfWeek.includes(today))
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))[0];
  if (!first) return null;
  return formatTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), first.hour, first.minute));
}

/** The snapshot without its timestamp, to skip rewriting the widget when nothing changed. */
export function snapshotKey(s: TodayWidgetSnapshot): string {
  const { updatedAt: _ignored, ...rest } = s;
  return JSON.stringify(rest);
}

/** "1.75 / 2 L" or "59 / 68 oz", like Figma's "1.8 / 3 L". */
export function widgetWaterText(glasses: number, goalGlasses: number, unit: "ml" | "oz"): string {
  if (unit === "oz") return `${Math.round(mlToOz(glasses * ML_PER_GLASS))} / ${Math.round(mlToOz(goalGlasses * ML_PER_GLASS))} oz`;
  const litres = (g: number) => Number(((g * ML_PER_GLASS) / 1000).toFixed(2));
  return `${litres(glasses)} / ${litres(goalGlasses)} L`;
}

export function widgetQuickAddLabel(unit: "ml" | "oz"): string {
  const ml = WIDGET_WATER_GLASSES * ML_PER_GLASS;
  return unit === "oz" ? `+${Math.round(mlToOz(ml))} oz` : `+${ml} ml`;
}

function workoutText(w: TodayWidgetSnapshot["workout"]): string {
  switch (w.state) {
    case "planned":
      return w.time ? `${w.name} · ${w.time}` : `${w.name}`;
    case "in_progress":
      return `${w.name} · in progress`;
    case "done":
      return `Done: ${w.name}`;
    case "rest":
      return "Rest day";
    case "program_complete":
      return "Program finished · pick the next one";
    default:
      return "No workout planned";
  }
}

export interface TodayWidgetView {
  rows: Array<{ label: string; value: string }>;
  /** "+250 ml" on the Water row; hidden when there's nothing current to add to. */
  quickAdd: string | null;
  /** One line under the rows, e.g. "Open Fynrox to update". */
  note: string | null;
}

/** What the widget shows. `notice` is a one-off message from the last tap (e.g. a failed water log). */
export function todayWidgetView(snapshot: TodayWidgetSnapshot | null, now: Date, notice?: string | null): TodayWidgetView {
  if (!snapshot || snapshot.version !== 1) {
    return {
      rows: [
        { label: "Workout", value: "Open Fynrox to see today" },
        { label: "Water", value: "—" },
        { label: "Protein", value: "—" },
      ],
      quickAdd: null,
      note: notice ?? null,
    };
  }
  if (snapshot.date !== widgetDay(now)) {
    return {
      rows: [
        { label: "Workout", value: "Open Fynrox for today's plan" },
        { label: "Water", value: widgetWaterText(0, snapshot.water.goalGlasses, snapshot.water.unit).replace(/^0 /, "— ") },
        { label: "Protein", value: "—" },
      ],
      quickAdd: null,
      note: notice ?? "Open Fynrox to update",
    };
  }
  const { water, protein } = snapshot;
  return {
    rows: [
      { label: "Workout", value: workoutText(snapshot.workout) },
      { label: "Water", value: widgetWaterText(water.glasses, water.goalGlasses, water.unit) },
      {
        label: "Protein",
        value: protein.leftG > 0 ? `${protein.leftG} g left of ${protein.targetG} g` : `Goal reached · ${protein.targetG} g`,
      },
    ],
    quickAdd: widgetQuickAddLabel(water.unit),
    note: notice ?? null,
  };
}

// ---- Storage ----------------------------------------------------------------

export async function readTodayWidgetSnapshot(): Promise<TodayWidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(TODAY_WIDGET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodayWidgetSnapshot;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeTodayWidgetSnapshot(snapshot: TodayWidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(TODAY_WIDGET_STORAGE_KEY, JSON.stringify(snapshot)).catch(() => undefined);
}

export async function deleteTodayWidgetSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(TODAY_WIDGET_STORAGE_KEY).catch(() => undefined);
}
