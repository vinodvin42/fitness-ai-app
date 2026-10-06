/**
 * Readiness score (Figma Today 01/06 "Readiness Score" card).
 *
 * An honest, transparent 0-100 number computed ONLY from the user's own
 * RecoveryLog rows (self-logged or device-synced) - never a fabricated or
 * model-guessed value. It is a training-readiness heuristic, not a medical
 * measurement.
 *
 * Components (each scored 0-100, then weight-averaged over whichever are
 * available - missing components are dropped and the weights renormalised):
 *
 *   sleep     30%  sleepHours / 8h target, capped at 100
 *   hrv       25%  newest HRV vs the user's OWN baseline (mean of the other
 *                  logs in the prior 30 days, needs >= 3 of them):
 *                  score = clamp(80 + (ratio - 1) * 200)
 *                  (100 at +10% over baseline, 80 at baseline, 0 at -40%)
 *   restingHr 15%  resting HR vs own baseline (lower is better, same >= 3
 *                  baseline rule): score = clamp(80 - deltaBpm * 8)
 *                  (100 at -2.5 bpm or better, 0 at +10 bpm or worse)
 *   energy    15%  (energyLevel - 1) / 4 * 100   (1-5 scale)
 *   soreness  15%  (5 - soreness) / 4 * 100       (1-5 scale, 5 = very sore)
 *
 * A score is only returned when at least MIN_COMPONENTS (3) components are
 * available AND the newest log is from today or yesterday (UTC date).
 * Otherwise `score` is null with a human-readable `reason` - callers must
 * show the "log recovery / connect a device" prompt instead of a number.
 *
 * Bands: >= 75 "Ready to Train", 50-74 "Train with Care", < 50 "Take it Easy".
 */

export interface ReadinessLogInput {
  date: Date;
  restingHeartRate: number | null;
  sleepHours: number | null;
  hrvMs: number | null;
  soreness: number | null;
  energyLevel: number | null;
}

export type ReadinessBand = "ready" | "moderate" | "rest";

export interface ReadinessComponent {
  key: "sleep" | "hrv" | "restingHr" | "energy" | "soreness";
  score: number;
  weight: number;
}

export interface ReadinessResult {
  score: number | null;
  band: ReadinessBand | null;
  headline: string | null;
  summary: string | null;
  components: ReadinessComponent[];
  reason: string | null;
}

export const MIN_COMPONENTS = 3;
export const MIN_BASELINE_SAMPLES = 3;
const WEIGHTS = { sleep: 0.3, hrv: 0.25, restingHr: 0.15, energy: 0.15, soreness: 0.15 } as const;

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function computeReadiness(
  latest: ReadinessLogInput | null,
  baselineLogs: ReadinessLogInput[],
  now: Date = new Date(),
): ReadinessResult {
  const empty = (reason: string): ReadinessResult => ({
    score: null,
    band: null,
    headline: null,
    summary: null,
    components: [],
    reason,
  });
  if (!latest) return empty("No recovery data logged yet.");
  const ageDays = (startOfUtcDay(now) - startOfUtcDay(latest.date)) / 86_400_000;
  if (ageDays > 1) return empty("Your latest recovery log is more than a day old.");

  const components: ReadinessComponent[] = [];
  if (latest.sleepHours != null) {
    components.push({ key: "sleep", score: clamp((latest.sleepHours / 8) * 100), weight: WEIGHTS.sleep });
  }
  const hrvBase = baselineLogs.map((l) => l.hrvMs).filter((v): v is number => v != null && v > 0);
  if (latest.hrvMs != null && hrvBase.length >= MIN_BASELINE_SAMPLES) {
    const ratio = latest.hrvMs / mean(hrvBase);
    components.push({ key: "hrv", score: clamp(80 + (ratio - 1) * 200), weight: WEIGHTS.hrv });
  }
  const rhrBase = baselineLogs.map((l) => l.restingHeartRate).filter((v): v is number => v != null);
  if (latest.restingHeartRate != null && rhrBase.length >= MIN_BASELINE_SAMPLES) {
    const delta = latest.restingHeartRate - mean(rhrBase);
    components.push({ key: "restingHr", score: clamp(80 - delta * 8), weight: WEIGHTS.restingHr });
  }
  if (latest.energyLevel != null) {
    components.push({ key: "energy", score: clamp(((latest.energyLevel - 1) / 4) * 100), weight: WEIGHTS.energy });
  }
  if (latest.soreness != null) {
    components.push({ key: "soreness", score: clamp(((5 - latest.soreness) / 4) * 100), weight: WEIGHTS.soreness });
  }

  if (components.length < MIN_COMPONENTS) {
    return {
      ...empty(
        `Need at least ${MIN_COMPONENTS} of sleep, HRV, resting heart rate, energy and soreness (HRV and resting heart rate also need ${MIN_BASELINE_SAMPLES}+ earlier days to compare against).`,
      ),
      components,
    };
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
  const band: ReadinessBand = score >= 75 ? "ready" : score >= 50 ? "moderate" : "rest";
  const headline = band === "ready" ? "Ready to Train" : band === "moderate" ? "Train with Care" : "Take it Easy";

  const sorted = [...components].sort((a, b) => b.score - a.score);
  const label: Record<ReadinessComponent["key"], string> = {
    sleep: "sleep",
    hrv: "HRV",
    restingHr: "resting heart rate",
    energy: "energy",
    soreness: "soreness",
  };
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const summary =
    band === "ready"
      ? `Your logged ${label[best.key]} looks strong. A good day for a full session.`
      : band === "moderate"
        ? `Mixed signals - ${label[worst.key]} is holding the score back. Consider a lighter session.`
        : `Your logged ${label[worst.key]} is low. Prioritise recovery today.`;

  return { score, band, headline, summary, components, reason: null };
}
