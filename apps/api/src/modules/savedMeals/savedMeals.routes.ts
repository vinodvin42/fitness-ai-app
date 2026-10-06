import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { createSavedMealSchema, recentFoodsQuerySchema, savedMealIdSchema } from "./savedMeals.schema";
import * as savedMealsService from "./savedMeals.service";

export const savedMealsRouter = Router();

savedMealsRouter.get("/saved-meals", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await savedMealsService.listSavedMeals(req.userId!) });
  } catch (err) {
    next(err);
  }
});

savedMealsRouter.post("/saved-meals", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createSavedMealSchema.parse(req.body);
    res.status(201).json(await savedMealsService.createSavedMeal(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

savedMealsRouter.delete("/saved-meals/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const { id } = savedMealIdSchema.parse(req.params);
    res.json(await savedMealsService.deleteSavedMeal(req.userId!, id));
  } catch (err) {
    next(err);
  }
});

savedMealsRouter.get("/meal-logs/recent-foods", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { limit } = recentFoodsQuerySchema.parse(req.query);
    res.json({ items: await savedMealsService.listRecentFoods(req.userId!, limit) });
  } catch (err) {
    next(err);
  }
});
