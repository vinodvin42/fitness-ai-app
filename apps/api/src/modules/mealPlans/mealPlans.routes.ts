import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import * as mealPlansService from "./mealPlans.service";

export const mealPlansRouter = Router();

// Meal-Plan Generation Engine (22 Sep 2026) — see mealPlans.service.ts's
// doc comment for the full design. Mounted under /nutrition, alongside the
// rest of Fuel's real endpoints (nutrition.routes.ts) — same convention as
// plans.routes.ts mounting its own endpoints at the router root rather
// than nesting under a prefix.

mealPlansRouter.post("/nutrition/meal-plans/generate", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.status(201).json(await mealPlansService.generateMealPlan(req.userId!));
  } catch (err) {
    next(err);
  }
});

mealPlansRouter.get("/nutrition/meal-plans/current", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const mealPlan = await mealPlansService.getCurrentMealPlan(req.userId!);
    res.json({ mealPlan });
  } catch (err) {
    next(err);
  }
});
