import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { logMealSchema, logWaterSchema } from "./nutrition.schema";
import * as nutritionService from "./nutrition.service";

export const nutritionRouter = Router();

nutritionRouter.get("/meal-logs/today", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await nutritionService.getTodayMealLogs(req.userId!) });
  } catch (err) {
    next(err);
  }
});

nutritionRouter.get("/meal-logs", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await nutritionService.listMealHistory(req.userId!) });
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post("/meal-logs", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = logMealSchema.parse(req.body);
    const mealLog = await nutritionService.logMeal(req.userId!, input);
    res.status(201).json(mealLog);
  } catch (err) {
    next(err);
  }
});

nutritionRouter.get("/water-logs/today", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await nutritionService.getTodayWaterLogs(req.userId!) });
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post("/water-logs", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = logWaterSchema.parse(req.body ?? {});
    const waterLog = await nutritionService.logWater(req.userId!, input);
    res.status(201).json(waterLog);
  } catch (err) {
    next(err);
  }
});
