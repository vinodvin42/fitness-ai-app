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

// U4 (15 Sep 2026) — Food input data-quality flow, BR-DAT-003. See
// apps/api's FoodEstimate model (schema.prisma) doc comment for the full
// design. description is free text describing what was eaten — the raw
// input the AI estimate is grounded in, kept short (300 chars) since this
// is a quick "what did you eat" prompt, not a paragraph.
export const createFoodEstimateSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string().trim().min(1).max(300),
});

export type CreateFoodEstimateInput = z.infer<typeof createFoodEstimateSchema>;

// Every field optional and independent, same "send only what changed"
// shape as updateProfileSchema elsewhere in this codebase — the service
// layer (not this schema) decides "confirmed" vs "edited" by comparing
// whatever IS sent against the estimate's own original values.
export const confirmFoodEstimateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  calories: z.number().int().nonnegative().max(10000).optional(),
  proteinG: z.number().int().nonnegative().max(1000).optional(),
  carbsG: z.number().int().nonnegative().max(1000).optional(),
  fatG: z.number().int().nonnegative().max(1000).optional(),
});

export type ConfirmFoodEstimateInput = z.infer<typeof confirmFoodEstimateSchema>;

// Barcode scan (R2 Wave, 22 Sep 2026) — GET /nutrition/barcode/:code, see
// lib/openFoodFactsClient.ts for the full design. Real EAN-8/UPC-E (8/6
// digits, rare) through EAN-13/UPC-A (13/12 digits, the common case) up to
// GTIN-14 (14 digits) barcode formats — digits only, no separators, same
// as how a camera barcode-scan API and Open Food Facts' own lookup both
// represent a barcode.
export const barcodeParamSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, "Barcode must be 6-14 digits"),
});

export type BarcodeParamInput = z.infer<typeof barcodeParamSchema>;
