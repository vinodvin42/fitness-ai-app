import type { Exercise } from "@fitness-ai-app/types";

/**
 * Swap-match scoring for Exercise Swap (Train 09), computed only from stored
 * exercise attributes:
 *   50  same muscle group (always true for API alternatives)
 * + 30  same equipment
 * + 20  same difficulty (10 when one level apart, 0 when two apart)
 * Capped at 100. This is a similarity score, not a claim about injury safety.
 */
export type SwapReason = "equipment_busy" | "joint_pain" | "preference" | "home";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

export function matchPercent(current: Pick<Exercise, "muscleGroup" | "equipment" | "difficulty">, alt: Pick<Exercise, "muscleGroup" | "equipment" | "difficulty">): number {
  const muscle = current.muscleGroup === alt.muscleGroup ? 50 : 0;
  const equipment = current.equipment === alt.equipment ? 30 : 0;
  const gap = Math.abs(LEVELS.indexOf(current.difficulty) - LEVELS.indexOf(alt.difficulty));
  const difficulty = gap === 0 ? 20 : gap === 1 ? 10 : 0;
  return Math.min(100, muscle + equipment + difficulty);
}

const HOME_EQUIPMENT = /body|dumbbell|band|kettle|none|mat/i;
const LOW_LOAD_EQUIPMENT = /machine|cable|body|band/i;

/** Re-ranks/filter alternatives for the chosen reason using equipment text only. */
export function rankAlternatives(current: Exercise, alternatives: Exercise[], reason: SwapReason): Exercise[] {
  let pool = alternatives.slice();
  if (reason === "equipment_busy") pool = pool.filter((a) => a.equipment !== current.equipment);
  if (reason === "home") pool = pool.filter((a) => HOME_EQUIPMENT.test(a.equipment));
  const bonus = (a: Exercise) => (reason === "joint_pain" && LOW_LOAD_EQUIPMENT.test(a.equipment) ? 1000 : 0);
  return pool
    .map((a) => ({ a, score: matchPercent(current, a) + bonus(a) }))
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a);
}

export function swapReasonCopy(current: Exercise, alt: Exercise, reason: SwapReason): string {
  const base = `Targets the same muscle group (${alt.muscleGroup}) using ${alt.equipment}${
    alt.equipment === current.equipment ? ", the same equipment" : ""
  }.`;
  switch (reason) {
    case "equipment_busy":
      return `${base} Uses different equipment from ${current.equipment}, so you do not have to wait for it.`;
    case "joint_pain":
      return `${base} Ranked first because machines, cables, bodyweight and bands are generally more supported. If pain continues, stop and speak to a professional.`;
    case "home":
      return `${base} Needs little or no gym equipment.`;
    default:
      return base;
  }
}
