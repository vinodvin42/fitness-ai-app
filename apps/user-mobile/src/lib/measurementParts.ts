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
  bicepLeft: { key: "bicepLeft", label: "Biceps L", field: "bicepLeftCm", tip: "Midway between shoulder and elbow, arm relaxed" },
  bicepRight: { key: "bicepRight", label: "Biceps R", field: "bicepRightCm", tip: "Midway between shoulder and elbow, arm relaxed" },
  forearmLeft: { key: "forearmLeft", label: "Forearm L", field: "forearmLeftCm", tip: "Widest part, just below the elbow" },
  forearmRight: { key: "forearmRight", label: "Forearm R", field: "forearmRightCm", tip: "Widest part, just below the elbow" },
  waist: { key: "waist", label: "Waist", field: "waistCm", tip: "At belly button level" },
  hips: { key: "hips", label: "Hips", field: "hipsCm", tip: "Around the widest part of your hips" },
  thighLeft: { key: "thighLeft", label: "Thigh L", field: "thighLeftCm", tip: "Widest part, just below the buttock" },
  thighRight: { key: "thighRight", label: "Thigh R", field: "thighRightCm", tip: "Widest part, just below the buttock" },
  calfLeft: { key: "calfLeft", label: "Calf L", field: "calfLeftCm", tip: "Around the widest part of the calf" },
  calfRight: { key: "calfRight", label: "Calf R", field: "calfRightCm", tip: "Around the widest part of the calf" },
};

/** Order of the one-part-at-a-time log (forearms stay in the full form). */
export const GUIDED_LOG_ORDER: MeasurementPartKey[] = [
  "neck",
  "shoulders",
  "chest",
  "waist",
  "hips",
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
 * Body-map label positions. `ax`/`ay` are the anchor on the 300×380 figure
 * used by BodySilhouette; `side` and `row` place the label in a column. The
 * person faces you on the front view, so their left is on your right.
 */
export interface MapSpot {
  key: MeasurementPartKey;
  side: "left" | "right";
  row: number;
  ax: number;
  ay: number;
}

export const FRONT_SPOTS: MapSpot[] = [
  { key: "shoulders", side: "left", row: 0, ax: 104, ay: 86 },
  { key: "bicepRight", side: "left", row: 1, ax: 76, ay: 140 },
  { key: "waist", side: "left", row: 2, ax: 120, ay: 190 },
  { key: "thighRight", side: "left", row: 3, ax: 128, ay: 284 },
  { key: "calfRight", side: "left", row: 4, ax: 125, ay: 340 },
  { key: "neck", side: "right", row: 0, ax: 154, ay: 66 },
  { key: "chest", side: "right", row: 1, ax: 176, ay: 116 },
  { key: "bicepLeft", side: "right", row: 2, ax: 224, ay: 140 },
  { key: "hips", side: "right", row: 3, ax: 184, ay: 230 },
  { key: "thighLeft", side: "right", row: 4, ax: 172, ay: 284 },
  { key: "calfLeft", side: "right", row: 5, ax: 175, ay: 340 },
];

/** Back view: the person faces away, so their left is on your left. */
export const BACK_SPOTS: MapSpot[] = [
  { key: "shoulders", side: "left", row: 0, ax: 104, ay: 86 },
  { key: "forearmLeft", side: "left", row: 1, ax: 64, ay: 200 },
  { key: "calfLeft", side: "left", row: 2, ax: 125, ay: 340 },
  { key: "hips", side: "right", row: 0, ax: 186, ay: 226 },
  { key: "forearmRight", side: "right", row: 1, ax: 236, ay: 200 },
  { key: "calfRight", side: "right", row: 2, ax: 175, ay: 340 },
];

/** Compare dates rows: single parts, or L/R pairs shown as "left / right". */
export const COMPARE_ROWS: Array<{ label: string; keys: MeasurementPartKey[] }> = [
  { label: "Neck", keys: ["neck"] },
  { label: "Shoulders", keys: ["shoulders"] },
  { label: "Chest", keys: ["chest"] },
  { label: "Biceps L/R", keys: ["bicepLeft", "bicepRight"] },
  { label: "Forearms L/R", keys: ["forearmLeft", "forearmRight"] },
  { label: "Waist", keys: ["waist"] },
  { label: "Hips", keys: ["hips"] },
  { label: "Thighs L/R", keys: ["thighLeft", "thighRight"] },
  { label: "Calves L/R", keys: ["calfLeft", "calfRight"] },
];

/** Mean of the parts that have a value in this entry (null when none). */
export function rowMean(m: BodyMeasurement, keys: readonly MeasurementPartKey[]): number | null {
  const v = keys.map((k) => m[MEASUREMENT_PARTS[k].field]).filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
