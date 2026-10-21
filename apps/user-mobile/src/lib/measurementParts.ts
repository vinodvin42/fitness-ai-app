import type { BodyMeasurement, LogMeasurementInput } from "@fitness-ai-app/types";
import type { FieldPick } from "./measurementFields";

/**
 * Tape-measure body parts (Figma "06b — Progress · Body measurements"). One
 * definition shared by the body map, the part sheet, Compare dates and the
 * one-part-at-a-time log, so they always agree on labels, fields and tips.
 * Every part maps to a stored BodyMeasurement column; nothing here is estimated.
 */
export type MeasurementPartKey =
  | "neck"
  | "shoulders"
  | "chest"
  | "upperBack"
  | "bicepLeft"
  | "bicepRight"
  | "forearmLeft"
  | "forearmRight"
  | "waist"
  | "hips"
  | "thighLeft"
  | "thighRight"
  | "calfLeft"
  | "calfRight";

type CmField = Extract<keyof BodyMeasurement & keyof LogMeasurementInput, `${string}Cm`>;

export interface MeasurementPart {
  key: MeasurementPartKey;
  label: string;
  field: CmField;
  /** Where to put the tape (shown in the log step and the how-to sheet). */
  tip: string;
}

export const MEASUREMENT_PARTS: Record<MeasurementPartKey, MeasurementPart> = {
  neck: { key: "neck", label: "Neck", field: "neckCm", tip: "Just below the Adam's apple" },
  shoulders: { key: "shoulders", label: "Shoulders", field: "shouldersCm", tip: "Around the widest part of both shoulders" },
  chest: { key: "chest", label: "Chest", field: "chestCm", tip: "Under the arms, across the middle of the chest" },
  upperBack: { key: "upperBack", label: "Upper back", field: "upperBackCm", tip: "Around the back just below the shoulder blades, arms relaxed" },
  bicepLeft: { key: "bicepLeft", label: "Biceps L", field: "bicepLeftCm", tip: "Midway between shoulder and elbow, arm relaxed" },
  bicepRight: { key: "bicepRight", label: "Biceps R", field: "bicepRightCm", tip: "Midway between shoulder and elbow, arm relaxed" },
  forearmLeft: { key: "forearmLeft", label: "Forearm L", field: "forearmLeftCm", tip: "Widest part, just below the elbow" },
  forearmRight: { key: "forearmRight", label: "Forearm R", field: "forearmRightCm", tip: "Widest part, just below the elbow" },
  waist: { key: "waist", label: "Waist", field: "waistCm", tip: "Measure at belly button level" },
  hips: { key: "hips", label: "Hips", field: "hipsCm", tip: "Around the widest part of your hips" },
  thighLeft: { key: "thighLeft", label: "Thigh L", field: "thighLeftCm", tip: "Widest part, just below the buttock" },
  thighRight: { key: "thighRight", label: "Thigh R", field: "thighRightCm", tip: "Widest part, just below the buttock" },
  calfLeft: { key: "calfLeft", label: "Calf L", field: "calfLeftCm", tip: "Around the widest part of the calf" },
  calfRight: { key: "calfRight", label: "Calf R", field: "calfRightCm", tip: "Around the widest part of the calf" },
};

/**
 * Order of the one-part-at-a-time log (Figma measure-04: Waist is step 3, then
 * Hips). Forearms stay in the "All fields" form.
 */
export const GUIDED_LOG_ORDER: MeasurementPartKey[] = [
  "neck",
  "chest",
  "waist",
  "hips",
  "shoulders",
  "upperBack",
  "bicepLeft",
  "bicepRight",
  "thighLeft",
  "thighRight",
  "calfLeft",
  "calfRight",
];

export const pickPart = (key: MeasurementPartKey): FieldPick => (m) => m[MEASUREMENT_PARTS[key].field];

/** One part's logged values, oldest first. */
export function partHistory(rows: readonly BodyMeasurement[], key: MeasurementPartKey): Array<{ value: number; at: string }> {
  const field = MEASUREMENT_PARTS[key].field;
  return rows
    .map((m) => ({ value: m[field], at: m.loggedAt }))
    .filter((v): v is { value: number; at: string } => v.value != null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Body-map layout, in Figma's 358×290 map-card space (measure-01 front,
 * measure-02 back). The person faces you on the front view, so their left is
 * on your right; on the back view their left is on your left.
 * - `chip`: left-column chips are anchored by their right edge (x = 110, where
 *   the leader starts) and right-column chips by their left edge (x = 248), so
 *   longer values never cross the leader line.
 * - `point`: top-left of the 8 px point.
 * - `leader`: the Figma leader line's box and which exported SVG draws it.
 */
export interface MapSpot {
  key: MeasurementPartKey;
  side: "left" | "right";
  chipTop: number;
  point: { left: number; top: number };
  leader: { svg: string; left: number; top: number; width: number; height: number };
}

const CHIP_LEFT_EDGE = 248;
const CHIP_RIGHT_EDGE = 110;
export const MAP_CHIP_EDGES = { left: CHIP_RIGHT_EDGE, right: CHIP_LEFT_EDGE } as const;

export const FRONT_SPOTS: MapSpot[] = [
  { key: "neck", side: "right", chipTop: 12, point: { left: 181, top: 64 }, leader: { svg: "frontLeaderNeck", left: 185, top: 30, width: 63, height: 38 } },
  { key: "chest", side: "right", chipTop: 58, point: { left: 187, top: 92 }, leader: { svg: "frontLeaderChest", left: 191, top: 76, width: 57, height: 20 } },
  { key: "bicepLeft", side: "right", chipTop: 104, point: { left: 214, top: 110 }, leader: { svg: "frontLeaderBicepsR", left: 218, top: 114, width: 30, height: 8 } },
  { key: "hips", side: "right", chipTop: 150, point: { left: 199, top: 156 }, leader: { svg: "frontLeaderHips", left: 203, top: 160, width: 45, height: 8 } },
  { key: "thighLeft", side: "right", chipTop: 196, point: { left: 194, top: 192 }, leader: { svg: "frontLeaderThighR", left: 198, top: 196, width: 50, height: 18 } },
  { key: "calfLeft", side: "right", chipTop: 242, point: { left: 192, top: 222 }, leader: { svg: "frontLeaderCalfR", left: 196, top: 226, width: 52, height: 34 } },
  { key: "shoulders", side: "left", chipTop: 30, point: { left: 142, top: 77 }, leader: { svg: "frontLeaderShoulders", left: 110, top: 48, width: 36, height: 33 } },
  { key: "bicepRight", side: "left", chipTop: 86, point: { left: 136, top: 110 }, leader: { svg: "frontLeaderBicepsL", left: 110, top: 104, width: 30, height: 10 } },
  { key: "waist", side: "left", chipTop: 142, point: { left: 156, top: 128 }, leader: { svg: "frontLeaderWaist", left: 110, top: 132, width: 50, height: 28 } },
  { key: "thighRight", side: "left", chipTop: 196, point: { left: 156, top: 192 }, leader: { svg: "frontLeaderThighL", left: 110, top: 196, width: 50, height: 18 } },
  { key: "calfRight", side: "left", chipTop: 242, point: { left: 158, top: 222 }, leader: { svg: "frontLeaderCalfL", left: 110, top: 226, width: 52, height: 34 } },
];

export const BACK_SPOTS: MapSpot[] = [
  { key: "shoulders", side: "left", chipTop: 30, point: { left: 142, top: 77 }, leader: { svg: "backLeaderShoulders", left: 110, top: 48, width: 36, height: 33 } },
  { key: "upperBack", side: "right", chipTop: 62, point: { left: 197, top: 100 }, leader: { svg: "backLeaderUpperBack", left: 201, top: 80, width: 47, height: 24 } },
  { key: "hips", side: "right", chipTop: 142, point: { left: 199, top: 156 }, leader: { svg: "backLeaderHips", left: 203, top: 160, width: 45, height: 0 } },
  { key: "calfLeft", side: "left", chipTop: 222, point: { left: 158, top: 222 }, leader: { svg: "backLeaderCalfL", left: 110, top: 226, width: 52, height: 14 } },
  { key: "calfRight", side: "right", chipTop: 222, point: { left: 192, top: 222 }, leader: { svg: "backLeaderCalfR", left: 196, top: 226, width: 52, height: 14 } },
];

/**
 * Where the tape goes on the 72×133.2 outline of the log step (Figma
 * measure-04 draws Waist at y 57.6). `x` is the point on the body's outer edge.
 */
export const LOG_MARKS: Record<MeasurementPartKey, { y: number; x1: number; x2: number; point: number }> = {
  neck: { y: 18.6, x1: 29.9, x2: 41.1, point: 31.9 },
  shoulders: { y: 25.2, x1: 15.5, x2: 56.5, point: 17.5 },
  chest: { y: 36.6, x1: 19.5, x2: 52.5, point: 21.0 },
  upperBack: { y: 42.0, x1: 20.5, x2: 51.5, point: 22.3 },
  bicepLeft: { y: 45.6, x1: 53.8, x2: 60.6, point: 60.0 },
  bicepRight: { y: 45.6, x1: 11.4, x2: 18.2, point: 12.0 },
  forearmLeft: { y: 61.2, x1: 55.7, x2: 61.8, point: 61.2 },
  forearmRight: { y: 61.2, x1: 10.2, x2: 16.3, point: 10.8 },
  waist: { y: 57.6, x1: 20.4, x2: 51.6, point: 24.6 },
  hips: { y: 74.4, x1: 17.4, x2: 53.6, point: 21.1 },
  thighLeft: { y: 90.0, x1: 36.5, x2: 50.5, point: 47.5 },
  thighRight: { y: 90.0, x1: 21.5, x2: 35.5, point: 23.5 },
  calfLeft: { y: 112.8, x1: 37.0, x2: 48.4, point: 46.8 },
  calfRight: { y: 112.8, x1: 23.6, x2: 35.0, point: 25.2 },
};

/**
 * Compare dates rows (Figma measure-05): single parts, or L/R pairs shown as
 * "left / right". Rows with nothing logged on either date are left out, so
 * Upper back and Forearms only appear once someone measures them.
 */
export const COMPARE_ROWS: Array<{ label: string; keys: MeasurementPartKey[]; view: "front" | "back" | "both" }> = [
  { label: "Neck", keys: ["neck"], view: "front" },
  { label: "Shoulders", keys: ["shoulders"], view: "both" },
  { label: "Chest", keys: ["chest"], view: "front" },
  { label: "Upper back", keys: ["upperBack"], view: "back" },
  { label: "Biceps L/R", keys: ["bicepLeft", "bicepRight"], view: "front" },
  { label: "Forearms L/R", keys: ["forearmLeft", "forearmRight"], view: "back" },
  { label: "Waist", keys: ["waist"], view: "front" },
  { label: "Hips", keys: ["hips"], view: "both" },
  { label: "Thighs L/R", keys: ["thighLeft", "thighRight"], view: "front" },
  { label: "Calves L/R", keys: ["calfLeft", "calfRight"], view: "both" },
];

/** Mean of the parts that have a value in this entry (null when none). */
export function rowMean(m: BodyMeasurement, keys: readonly MeasurementPartKey[]): number | null {
  const v = keys.map((k) => m[MEASUREMENT_PARTS[k].field]).filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** How many tape parts an entry has. */
export function tapeCount(m: BodyMeasurement): number {
  return (Object.keys(MEASUREMENT_PARTS) as MeasurementPartKey[]).filter((k) => m[MEASUREMENT_PARTS[k].field] != null).length;
}

/**
 * The two entries compared by default (Figma: "Sat 24 Oct vs Thu 24 Sep"):
 * the latest full check (3+ parts) and the full check closest to four weeks
 * before it, else the earliest earlier one. Falls back to any tape entries.
 * Null when there are fewer than two.
 */
export function defaultComparePair(rows: readonly BodyMeasurement[]): { from: BodyMeasurement; to: BodyMeasurement } | null {
  const tape = [...rows].filter((m) => tapeCount(m) > 0).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const full = tape.filter((m) => tapeCount(m) >= 3);
  const pool = full.length >= 2 ? full : tape;
  if (pool.length < 2) return null;
  const to = pool[pool.length - 1];
  const earlier = pool.slice(0, -1);
  const target = new Date(to.loggedAt).getTime() - 28 * 24 * 60 * 60 * 1000;
  const onOrBefore = earlier.filter((m) => new Date(m.loggedAt).getTime() <= target + 3 * 24 * 60 * 60 * 1000);
  const from = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : earlier[0];
  return { from, to };
}

/** "↓3.0" / "↑1.5" / "—" for a change in display units (null: no earlier value). */
export function changeArrow(d: number | null, digits = 1): string | null {
  if (d == null) return null;
  const r = Math.round(d * 10) / 10;
  return r === 0 ? "—" : `${r < 0 ? "↓" : "↑"}${Math.abs(r).toFixed(digits)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Figma's day-first dates: "24 Sep" (dm), "Thu 24 Sep" (day), "Thu, 24 Sep" (day + comma). */
export function measureDate(iso: string, style: "dm" | "day" | "dayComma"): string {
  const d = new Date(iso);
  const dm = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (style === "dm") return dm;
  return `${WEEKDAYS[d.getDay()]}${style === "dayComma" ? "," : ""} ${dm}`;
}

/** A length without a trailing ".0" ("82", "38.5"). */
export function trimLen(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
