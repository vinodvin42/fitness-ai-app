/**
 * Maps a gym's equipment list onto exercises. A GymEquipment row applies to an
 * exercise when its `category` equals Exercise.equipment (case-insensitive) and,
 * if it has an `exerciseKeyword`, the exercise name contains it. Rows with a
 * keyword take precedence over general rows for the category. Exercises whose
 * equipment the gym never listed are `unknown` (never flagged); "None" needs
 * no equipment.
 */
export interface EquipmentLike {
  id: string;
  name: string;
  category: string;
  exerciseKeyword: string | null;
  available: boolean;
  availabilityUpdatedAt: Date;
}
export interface ExerciseLike {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: string;
}

export type Availability =
  | { status: "available"; item: EquipmentLike }
  | { status: "unavailable"; item: EquipmentLike }
  | { status: "none_needed" }
  | { status: "unknown" };

const norm = (s: string) => s.trim().toLowerCase();

export function matchingRows(exercise: ExerciseLike, equipment: EquipmentLike[]): EquipmentLike[] {
  const sameCategory = equipment.filter((e) => norm(e.category) === norm(exercise.equipment));
  const keyed = sameCategory.filter((e) => e.exerciseKeyword && norm(exercise.name).includes(norm(e.exerciseKeyword)));
  return keyed.length > 0 ? keyed : sameCategory.filter((e) => !e.exerciseKeyword);
}

export function exerciseAvailability(exercise: ExerciseLike, equipment: EquipmentLike[]): Availability {
  if (norm(exercise.equipment) === "none") return { status: "none_needed" };
  const rows = matchingRows(exercise, equipment);
  if (rows.length === 0) return { status: "unknown" };
  const up = rows.find((r) => r.available);
  if (up) return { status: "available", item: up };
  // Report the most recently updated unavailable row.
  const down = [...rows].sort((a, b) => b.availabilityUpdatedAt.getTime() - a.availabilityUpdatedAt.getTime())[0];
  return { status: "unavailable", item: down };
}

const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2);

/**
 * Best real replacement for `from`: same muscle group, not already in the
 * workout, and confirmed available at this gym (or needing no equipment).
 * Prefers equipment the gym actually lists, then similar difficulty and a
 * shared movement word (e.g. "row"). Returns null when none qualifies.
 */
export function pickAlternative(
  from: ExerciseLike,
  candidates: ExerciseLike[],
  equipment: EquipmentLike[],
  excludeIds: Set<string>,
): { exercise: ExerciseLike; availability: Availability } | null {
  const fromTokens = new Set(tokens(from.name));
  let best: { exercise: ExerciseLike; availability: Availability; score: number } | null = null;
  for (const c of candidates) {
    if (c.id === from.id || excludeIds.has(c.id) || c.muscleGroup !== from.muscleGroup) continue;
    const availability = exerciseAvailability(c, equipment);
    if (availability.status !== "available" && availability.status !== "none_needed") continue;
    let score = availability.status === "available" ? 3 : 0;
    if (c.difficulty === from.difficulty) score += 1;
    score += tokens(c.name).filter((t) => fromTokens.has(t)).length * 2;
    if (!best || score > best.score || (score === best.score && c.name < best.exercise.name)) {
      best = { exercise: c, availability, score };
    }
  }
  return best ? { exercise: best.exercise, availability: best.availability } : null;
}
