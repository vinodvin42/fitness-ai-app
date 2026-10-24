import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

/** The user's bookmarked recipes, newest saved first. Unpublished recipes are hidden. */
export async function listSavedRecipes(userId: string) {
  const rows = await prisma.savedRecipe.findMany({
    where: { userId, recipe: { status: "published" } },
    orderBy: { createdAt: "desc" },
    include: { recipe: true },
  });
  return rows.map((r) => ({ ...r.recipe, savedAt: r.createdAt }));
}

/** Idempotent: saving an already-saved recipe returns the same result. */
export async function saveRecipe(userId: string, recipeId: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { id: true, status: true } });
  if (!recipe || recipe.status !== "published") {
    throw new ApiHttpError(404, "recipe_not_found", "Recipe not found");
  }
  await prisma.savedRecipe.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId },
    update: {},
  });
  return { recipeId, saved: true as const };
}

/** The member's own "How was it?" for a recipe (Figma fuel/17), or null. */
export async function getRecipeRating(userId: string, recipeId: string) {
  const row = await prisma.recipeRating.findUnique({ where: { userId_recipeId: { userId, recipeId } } });
  return { recipeId, rating: row?.rating ?? null };
}

/** Rate a published recipe 1-4; a new answer replaces the old one. */
export async function rateRecipe(userId: string, recipeId: string, rating: number) {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { status: true } });
  if (!recipe || recipe.status !== "published") {
    throw new ApiHttpError(404, "recipe_not_found", "Recipe not found");
  }
  await prisma.recipeRating.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId, rating },
    update: { rating },
  });
  return { recipeId, rating };
}

/** Idempotent: clearing a rating that doesn't exist is a no-op. */
export async function clearRecipeRating(userId: string, recipeId: string) {
  await prisma.recipeRating.deleteMany({ where: { userId, recipeId } });
  return { recipeId, rating: null };
}

/** Idempotent: removing a recipe that is not saved is a no-op. */
export async function unsaveRecipe(userId: string, recipeId: string) {
  await prisma.savedRecipe.deleteMany({ where: { userId, recipeId } });
  return { recipeId, saved: false as const };
}
