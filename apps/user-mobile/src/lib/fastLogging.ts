/**
 * Fast set logging (Figma "03b — Train · Fast logging"). Pure helpers, so the
 * Active Workout screen and its sheets share one definition of each rule.
 */

export interface SetValues {
  weightKg?: number;
  reps: number;
}

/** "24 × 10", "× 12" without a weight, "—" when there is nothing to show. */
export function formatSetValues(v: { weightKg?: number | null; reps: number } | null | undefined): string {
  if (!v) return "—";
  return v.weightKg != null ? `${formatWeight(v.weightKg)} × ${v.reps}` : `× ${v.reps}`;
}

/** 24 -> "24", 57.5 -> "57.5", 1.25 -> "1.25" (no trailing zeros). */
export function formatWeight(kg: number): string {
  return String(Number(kg.toFixed(2)));
}

/**
 * Warm-ups generated from a working weight: about 40% × 10, 65% × 6 and 85% × 3
 * (Figma log/04: 24 kg -> 10, 16, 20), each rounded to the nearest loading step.
 * Results under one step, at or above the working weight, or repeated are dropped.
 */
export const WARMUP_SCHEME: ReadonlyArray<{ pct: number; reps: number }> = [
  { pct: 0.4, reps: 10 },
  { pct: 0.65, reps: 6 },
  { pct: 0.85, reps: 3 },
];

export function warmUpSets(workingKg: number, stepKg: number): SetValues[] {
  if (!(workingKg > 0) || !(stepKg > 0)) return [];
  const out: SetValues[] = [];
  for (const { pct, reps } of WARMUP_SCHEME) {
    const kg = Math.round((workingKg * pct) / stepKg) * stepKg;
    if (kg >= stepKg && kg < workingKg && !out.some((s) => s.weightKg === kg)) out.push({ weightKg: Number(kg.toFixed(2)), reps });
  }
  return out;
}

/** Barbells load in 2.5 kg steps (1.25 kg plates each side); everything else in 2 kg (common dumbbell pairs). */
export function loadingStepKg(equipment: string): number {
  return isBarbell(equipment) ? 2.5 : 2;
}

export function isBarbell(equipment: string): boolean {
  return /barbell|ez curl bar/i.test(equipment);
}

/** Standard plate sets (per side). The app has no per-gym plate inventory, so these are the defaults. */
export const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] } as const;
export const BARS = { kg: [20, 15, 10], lb: [45, 35, 25] } as const;
export type PlateUnit = keyof typeof PLATES;

export interface PlateLoad {
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** Total the plates + bar actually make (can be below the target if it isn't reachable). */
  loaded: number;
  /** True when `loaded` equals the target exactly. */
  exact: boolean;
}

/** Greedy per-side loading with the available plates (unlimited pairs of each). Null when the target is below the bar. */
export function plateLoad(target: number, bar: number, available: readonly number[]): PlateLoad | null {
  if (!(target >= bar)) return null;
  let perSideLeft = Math.round(((target - bar) / 2) * 1000) / 1000;
  const perSide: number[] = [];
  for (const p of [...available].sort((a, b) => b - a)) {
    while (perSideLeft + 1e-9 >= p) {
      perSide.push(p);
      perSideLeft = Math.round((perSideLeft - p) * 1000) / 1000;
    }
  }
  const loaded = bar + 2 * perSide.reduce((s, p) => s + p, 0);
  return { perSide, loaded: Number(loaded.toFixed(2)), exact: Math.abs(loaded - target) < 1e-6 };
}

/**
 * The "PREVIOUS" column: the most recent other completed session of the same
 * workout. Session lists arrive newest first (GET /workout-sessions).
 */
export function previousSessionId(
  history: ReadonlyArray<{ id: string; workoutId: string; status: string }> | undefined,
  workoutId: string,
  currentSessionId: string,
): string | undefined {
  return history?.find((h) => h.workoutId === workoutId && h.id !== currentSessionId && h.status === "completed")?.id;
}

/** Row labels: warm-ups "W", drop sets "D", failure sets "F", other working sets 1..n (Figma log/01 legend). */
export function setRowLabels(sets: ReadonlyArray<{ isWarmup?: boolean; isDropSet?: boolean; isFailure?: boolean }>): string[] {
  let working = 0;
  return sets.map((s) => {
    if (s.isWarmup) return "W";
    if (s.isDropSet) return "D";
    if (s.isFailure) return "F";
    working += 1;
    return String(working);
  });
}
