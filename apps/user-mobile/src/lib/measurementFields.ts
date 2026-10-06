import type { BodyMeasurement } from "@fitness-ai-app/types";

export type FieldPick = (m: BodyMeasurement) => number | null;

const mean = (a: number | null, b: number | null): number | null => {
  const v = [a, b].filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/** Arms = mean of the L/R biceps when logged, else the legacy single "arms" value. */
export const pickArms: FieldPick = (m) => mean(m.bicepLeftCm, m.bicepRightCm) ?? m.armsCm;
/** Thighs = mean of L/R, else the legacy single "thighs" value. */
export const pickThighs: FieldPick = (m) => mean(m.thighLeftCm, m.thighRightCm) ?? m.thighsCm;
export const pickCalves: FieldPick = (m) => mean(m.calfLeftCm, m.calfRightCm);
export const pickForearms: FieldPick = (m) => mean(m.forearmLeftCm, m.forearmRightCm);

export interface FieldChange {
  latest: { value: number; at: string } | null;
  /** The value before the latest one for this field (not necessarily the previous entry). */
  previous: { value: number; at: string } | null;
  first: { value: number; at: string } | null;
  delta: number | null;
}

/** `rows` may be in any order. Latest / previous / first value of one field, with delta (latest - previous). */
export function fieldChange(rows: BodyMeasurement[], pick: FieldPick): FieldChange {
  const vals = rows
    .map((m) => ({ value: pick(m), at: m.loggedAt }))
    .filter((v): v is { value: number; at: string } => v.value != null)
    .sort((a, b) => a.at.localeCompare(b.at));
  const latest = vals[vals.length - 1] ?? null;
  const previous = vals.length > 1 ? vals[vals.length - 2] : null;
  return {
    latest,
    previous,
    first: vals[0] ?? null,
    delta: latest && previous ? Math.round((latest.value - previous.value) * 10) / 10 : null,
  };
}

/** "+1.5" / "-2.0" style signed number. */
export function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(1)}`;
}
