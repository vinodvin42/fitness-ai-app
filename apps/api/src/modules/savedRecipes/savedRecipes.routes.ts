import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { saveRecipeSchema, savedRecipeParamsSchema } from "./savedRecipes.schema";
import * as savedRecipesService from "./savedRecipes.service";

export const savedRecipesRouter = Router();

savedRecipesRouter.get("/saved-recipes", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await savedRecipesService.listSavedRecipes(req.userId!) });
  } catch (err) {
    next(err);
  }
});

savedRecipesRouter.post("/saved-recipes", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const { recipeId } = saveRecipeSchema.parse(req.body);
    res.status(201).json(await savedRecipesService.saveRecipe(req.userId!, recipeId));
  } catch (err) {
    next(err);
  }
});

savedRecipesRouter.delete("/saved-recipes/:recipeId", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const { recipeId } = savedRecipeParamsSchema.parse(req.params);
    res.json(await savedRecipesService.unsaveRecipe(req.userId!, recipeId));
  } catch (err) {
    next(err);
  }
});
