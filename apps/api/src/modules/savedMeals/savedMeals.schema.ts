import { z } from "zod";

// Fuel 02 "My Saved Meals" (Oct 2026). A saved meal is a user's own reusable
// name + macros, created from a meal they just logged or confirmed.
export const createSavedMealSchema = z.object({
  name: z.string().trim().min(1).max(120),
  calories: z.number().int().nonnegative().max(10000),
  proteinG: z.number().int().nonnegative().max(1000).default(0),
  carbsG: z.number().int().nonnegative().max(1000).default(0),
  fatG: z.number().int().nonnegative().max(1000).default(0),
  // Optional component breakdown (e.g. an AI estimate's items) kept verbatim.
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.string().trim().max(60).optional(),
        calories: z.number().int().nonnegative().max(10000).optional(),
      }),
    )
    .max(30)
    .optional(),
});
export type CreateSavedMealInput = z.infer<typeof createSavedMealSchema>;

export const savedMealIdSchema = z.object({ id: z.string().min(1).max(191) });

export const recentFoodsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6),
});
