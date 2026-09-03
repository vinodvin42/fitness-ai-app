import { z } from "zod";

// The Fuel/Nutrition daily loop (docs/mobile/03-screen-inventory.md §D):
// a meal is logged either from a seeded Recipe (Recipe Detail's "Log"
// action — recipeId only, macros are copied server-side) or via manual
// macro entry (Log Meal's manual-entry card — name + calories required,
// macros optional). Barcode scan and AI photo logging (also on Log Meal)
// are separate input *methods* into this same shape — not built yet, they
// need camera/vision integrations this pass doesn't have.
export const logMealSchema = z
  .object({
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    // String id (uuid is only the default generator; seed uses "rec-oats").
    // See coaching.schema.ts's createBookingSchema comment — found 31 Aug 2026.
    recipeId: z.string().min(1).max(191).optional(),
    name: z.string().min(1).max(120).optional(),
    calories: z.number().int().nonnegative().max(10000).optional(),
    proteinG: z.number().int().nonnegative().max(1000).optional(),
    carbsG: z.number().int().nonnegative().max(1000).optional(),
    fatG: z.number().int().nonnegative().max(1000).optional(),
  })
  .refine((data) => Boolean(data.recipeId) || (Boolean(data.name) && data.calories !== undefined), {
    message: "Provide either recipeId or name + calories for a manual entry",
  });

export type LogMealInput = z.infer<typeof logMealSchema>;

// Nutrition Dashboard's water-intake tracker (§D) — a single "+1 Glass" (or
// multi-glass) quick-add, append-only like logMealSchema above. glasses
// defaults to 1 so a bare `{}` body from the simplest possible client still
// works.
export const logWaterSchema = z.object({
  glasses: z.number().int().positive().max(20).default(1),
});

export type LogWaterInput = z.infer<typeof logWaterSchema>;
