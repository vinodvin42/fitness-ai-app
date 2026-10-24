/**
 * The health and food choices offered in onboarding (Figma 01 Onboarding 07
 * and 08) and again after setup (24 Oct 2026: Profile › Health & safety and
 * Food preferences, the setup checklist's "Make your plan safer"). One list,
 * so both places always offer the same answers.
 */
export const MEDICAL_CONDITIONS = ["None", "Diabetes", "Hypertension", "Heart Condition", "Asthma", "Thyroid", "PCOS/PCOD", "Prefer not to say"];
/** "None" and "Prefer not to say" are answers, not conditions, and exclude every real condition. */
export const EXCLUSIVE_CONDITIONS = ["None", "Prefer not to say"];
export const INJURIES = ["Head", "Shoulders", "Core/Back", "Knees", "Wrists", "Ankles"];

export const isHeartCondition = (c: string) => c.toLowerCase() === "heart condition";

/** Toggle one condition, keeping "None" / "Prefer not to say" exclusive. */
export function toggleCondition(current: readonly string[], condition: string): string[] {
  if (EXCLUSIVE_CONDITIONS.includes(condition)) return current.includes(condition) ? [] : [condition];
  const without = current.filter((c) => !EXCLUSIVE_CONDITIONS.includes(c));
  return without.includes(condition) ? without.filter((c) => c !== condition) : [...without, condition];
}

// dietType is a free string server-side.
export const DIET_TYPES = [
  { value: "Vegetarian", subtitle: "No meat, fish or eggs (milk is fine)" },
  { value: "Vegan", subtitle: "No meat, fish, eggs or milk" },
  { value: "Non-Vegetarian", subtitle: "Eats meat, fish and eggs" },
  { value: "Eggetarian", subtitle: "Vegetarian + eggs" },
  { value: "Pescatarian", subtitle: "Vegetarian + fish and seafood" },
  { value: "Jain", subtitle: "No meat, eggs or root vegetables" },
];
export const ALLERGENS = ["Dairy", "Nuts", "Gluten", "Soy", "Eggs", "Shellfish", "Wheat", "Sesame", "None"];

/** Toggle one allergen, keeping "None" exclusive. */
export function toggleAllergen(current: readonly string[], allergen: string): string[] {
  if (allergen === "None") return current.includes("None") ? [] : ["None"];
  const without = current.filter((a) => a !== "None");
  return without.includes(allergen) ? without.filter((a) => a !== allergen) : [...without, allergen];
}
