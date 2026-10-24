import type { FoodEstimateItem } from "@fitness-ai-app/types";

/**
 * Indian household portions (owner, 24 Oct 2026: "build indian portions";
 * Figma fuel/11-12). Gram equivalents are the ones Figma's "Indian portion
 * guide" shows; bowl, teaspoon, piece and slice are labelled the same way so
 * every conversion is visible to the member. Nutrition is always scaled from
 * the item's own grams (calories per gram), so switching units never changes
 * the food, only the amount. Pure (tests/indianPortions.check.cjs).
 */
export type PortionUnit = "katori" | "bowl" | "cup" | "glass" | "tbsp" | "tsp" | "roti" | "piece" | "slice" | "g" | "ml";

/** Grams (or ml) in one unit; null when it depends on the food (piece, slice). */
export const UNIT_GRAMS: Record<PortionUnit, number | null> = {
  katori: 150,
  bowl: 250,
  cup: 150,
  glass: 250,
  tbsp: 15,
  tsp: 5,
  roti: 40,
  piece: null,
  slice: null,
  g: 1,
  ml: 1,
};

/** Figma's "Indian portion guide" (fuel/11). */
export const PORTION_GUIDE: Array<{ label: string; value: string }> = [
  { label: "1 katori", value: "≈ 150 g" },
  { label: "1 bowl", value: "≈ 250 g" },
  { label: "1 roti (6 inch)", value: "≈ 40 g" },
  { label: "1 cup cooked rice", value: "≈ 150 g" },
  { label: "1 glass", value: "250 ml" },
  { label: "1 tablespoon", value: "15 ml" },
];

const UNIT_NAMES: Record<PortionUnit, string> = {
  katori: "katori",
  bowl: "bowl",
  cup: "cup",
  glass: "glass",
  tbsp: "tbsp",
  tsp: "tsp",
  roti: "roti",
  piece: "piece",
  slice: "slice",
  g: "g",
  ml: "ml",
};

export const UNIT_CHIP_LABELS: Record<PortionUnit, string> = {
  katori: "Katori",
  bowl: "Bowl",
  cup: "Cup",
  glass: "Glass",
  tbsp: "Tablespoon",
  tsp: "Teaspoon",
  roti: "Roti",
  piece: "Piece",
  slice: "Slice",
  g: "Grams",
  ml: "ml",
};

export const asUnit = (u: string): PortionUnit => (u in UNIT_GRAMS ? (u as PortionUnit) : "piece");

/** "½", "1", "1½", "2¼" … for household amounts; plain numbers for grams. */
export function formatAmount(n: number, unit: PortionUnit): string {
  if (unit === "g" || unit === "ml") return String(Math.round(n));
  const whole = Math.floor(n + 1e-9);
  const frac = Math.round((n - whole) * 4) / 4;
  const f = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
  if (frac === 1) return String(whole + 1);
  return whole === 0 && f ? f : `${whole}${f}`;
}

/** "1½ katori", "2 roti", "150 g". */
export function portionText(amount: number, unit: PortionUnit): string {
  const a = formatAmount(amount, unit);
  return unit === "g" || unit === "ml" ? `${a} ${unit}` : `${a} ${UNIT_NAMES[unit]}`;
}

/** Quick amounts under the stepper (Figma: ½ · 1 · 1½ · 2; roti 1 · 2 · 3). */
export function quickAmounts(unit: PortionUnit): number[] {
  if (unit === "g" || unit === "ml") return [50, 100, 150, 200];
  if (unit === "roti" || unit === "piece" || unit === "slice" || unit === "tbsp" || unit === "tsp") return [1, 2, 3];
  return [0.5, 1, 1.5, 2];
}

export function stepFor(unit: PortionUnit): number {
  if (unit === "g" || unit === "ml") return 10;
  if (unit === "roti" || unit === "piece" || unit === "slice" || unit === "tbsp" || unit === "tsp") return 1;
  return 0.5;
}

/**
 * Units a member can switch to for this item: spoonable food (katori, cup,
 * bowl, glass, spoons) gets Figma's chips; a counted food (roti, piece,
 * slice) keeps its own unit and grams.
 */
export function unitOptions(item: Pick<FoodEstimateItem, "unit">): PortionUnit[] {
  const u = asUnit(item.unit);
  if (u === "roti" || u === "piece" || u === "slice") return [u, "g"];
  if (u === "glass" || u === "ml") return ["glass", "cup", "ml"];
  return ["katori", "bowl", "cup", "tbsp", "g"];
}

/** Grams in `amount` of `unit`, for this item (its own unit uses its own grams per unit). */
export function gramsFor(item: Pick<FoodEstimateItem, "amount" | "unit" | "grams">, amount: number, unit: PortionUnit): number {
  if (unit === asUnit(item.unit) && item.amount > 0) return (item.grams / item.amount) * amount;
  const per = UNIT_GRAMS[unit];
  return per == null ? (item.grams / Math.max(item.amount, 1e-9)) * amount : per * amount;
}

/** The item at a new amount/unit, nutrition scaled by grams. */
export function rescale(item: FoodEstimateItem, amount: number, unit: PortionUnit): FoodEstimateItem {
  const grams = gramsFor(item, amount, unit);
  const k = item.grams > 0 ? grams / item.grams : 0;
  return {
    ...item,
    amount,
    unit,
    grams: Math.round(grams),
    calories: Math.round(item.calories * k),
    proteinG: Math.round(item.proteinG * k),
    carbsG: Math.round(item.carbsG * k),
    fatG: Math.round(item.fatG * k),
    ...(item.alt
      ? {
          alt: {
            ...item.alt,
            calories: Math.round(item.alt.calories * k),
            proteinG: Math.round(item.alt.proteinG * k),
            carbsG: Math.round(item.alt.carbsG * k),
            fatG: Math.round(item.alt.fatG * k),
          },
        }
      : {}),
  };
}

/** The amount after switching unit, keeping the same grams (rounded to the new unit's step). */
export function convertAmount(item: FoodEstimateItem, toUnit: PortionUnit): number {
  const per = toUnit === asUnit(item.unit) ? item.grams / Math.max(item.amount, 1e-9) : UNIT_GRAMS[toUnit] ?? item.grams / Math.max(item.amount, 1e-9);
  // Grams and ml keep the exact weight; household units round to their step (½ katori, 1 roti).
  if (toUnit === "g" || toUnit === "ml") return Math.max(1, Math.round(item.grams / per));
  const step = stepFor(toUnit);
  return Math.max(step, Math.round(item.grams / per / step) * step);
}

/** Totals of the items as chosen ("main" food, its "alt", or removed). */
export function totals(items: FoodEstimateItem[], choice: Array<"main" | "alt" | "removed">) {
  const t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  items.forEach((it, i) => {
    const c = choice[i] ?? "main";
    if (c === "removed") return;
    const src = c === "alt" && it.alt ? it.alt : it;
    t.calories += src.calories;
    t.proteinG += src.proteinG;
    t.carbsG += src.carbsG;
    t.fatG += src.fatG;
  });
  return t;
}
