import { z } from "zod";

// Profile & Settings 01 "Saved Recipes" (Oct 2026). Ids are plain Strings in
// this schema, so validate length, not UUID shape.
export const saveRecipeSchema = z.object({ recipeId: z.string().min(1).max(191) });
export const savedRecipeParamsSchema = z.object({ recipeId: z.string().min(1).max(191) });

// Figma fuel/17 "How was it?" (24 Oct 2026): 1 Not for me, 2 Okay, 3 Good, 4 Loved it.
export const recipeRatingSchema = z.object({ rating: z.number().int().min(1).max(4) });
