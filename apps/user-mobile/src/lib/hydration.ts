import { mlToOz } from "./measureUnits";

/**
 * Water is stored as whole glasses (WaterLog.glasses). These are still the
 * app-wide placeholders shared by Today and Fuel: there is no per-user
 * hydration goal yet, so the goal stays 8 glasses (2 L) until one is modeled.
 */
export const WATER_GOAL_GLASSES = 8;
export const ML_PER_GLASS = 250;

/** Quick-add buttons, as whole glasses so they map onto the stored unit exactly. */
export const WATER_QUICK_ADD_GLASSES = [1, 2] as const;

/** Glasses -> "1.75 L" (ml users) or "59 oz" (oz users). */
export function waterTotalText(glasses: number, unit: "ml" | "oz"): string {
  const ml = glasses * ML_PER_GLASS;
  if (unit === "oz") return `${Math.round(mlToOz(ml))} oz`;
  return `${Number((ml / 1000).toFixed(2))} L`;
}
