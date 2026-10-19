/**
 * Cooking-mode helpers (Figma Fuel 16 step guide). Recipes store plain-text
 * steps and an ingredient list, with no per-step timers or ingredient links,
 * so both are read from the step's own words. Nothing is offered unless the
 * step text says it.
 */

/**
 * A timer the step itself asks for: "for 3–4 minutes" -> 240 s (the upper
 * end, so food isn't undercooked), "simmer 10 min" -> 600 s, "1 hour" -> 3600 s.
 * Null when the step names no duration (or more than 3 hours).
 */
export function stepTimerSeconds(step: string): number | null {
  const m = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i.exec(step);
  if (!m) return null;
  const n = parseFloat(m[2] ?? m[1]);
  const unit = m[3].toLowerCase();
  const seconds = unit.startsWith("h") ? n * 3600 : unit.startsWith("m") ? n * 60 : n;
  return seconds > 0 && seconds <= 3 * 3600 ? Math.round(seconds) : null;
}

const STOP_WORDS = new Set(["fresh", "chopped", "sliced", "diced", "large", "small", "medium", "green", "whole", "powder", "seeds", "leaves", "with", "and"]);

/** Ingredients the step mentions by name (any distinctive word of the name, 4+ letters, singular or plural). */
export function ingredientsInStep<T extends { name: string }>(step: string, ingredients: readonly T[]): T[] {
  const text = step.toLowerCase();
  return ingredients.filter((ing) =>
    ing.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
      .some((w) => new RegExp(`\\b${w.replace(/(es|s)$/, "")}(e?s)?\\b`).test(text)),
  );
}
