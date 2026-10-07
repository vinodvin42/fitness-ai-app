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

/** Idempotent: removing a recipe that is not saved is a no-op. */
export async function unsaveRecipe(userId: string, recipeId: string) {
  await prisma.savedRecipe.deleteMany({ where: { userId, recipeId } });
  return { recipeId, saved: false as const };
}
