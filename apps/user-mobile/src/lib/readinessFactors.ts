/**
 * Plain names for the factors behind the recovery (readiness) score.
 *
 * GET /recovery/readiness returns each factor by its internal key
 * (`restingHr`, `hrv`...). Those keys are code, not copy: shown raw they
 * read as "restingHr" on a user's screen. Anything the API adds later
 * still reads as words through the camelCase fallback.
 */
const FACTOR_LABELS: Record<string, string> = {
  sleep: "Sleep",
  hrv: "How rested your body is",
  restingHr: "Resting heart rate",
  restingHeartRate: "Resting heart rate",
  energy: "Energy",
  energyLevel: "Energy",
  soreness: "Muscle soreness",
};

/** "restingHr" -> "Resting heart rate"; an unknown "someNewFactor" -> "Some new factor". */
export function readinessFactorLabel(key: string): string {
  const known = FACTOR_LABELS[key];
  if (known) return known;
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}
