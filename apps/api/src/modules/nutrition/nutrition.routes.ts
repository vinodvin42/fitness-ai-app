import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit, barcodeRateLimit } from "../../middleware/rateLimit";
import {
  barcodeParamSchema,
  confirmFoodEstimateSchema,
  createFoodEstimateSchema,
  logMealSchema,
  logWaterSchema,
} from "./nutrition.schema";
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

// Food input data-quality flow (U4, 15 Sep 2026) — see
// nutrition.service.ts's own doc comment. writeRateLimit on both: the
// estimate call is a real, non-free LLM request, and confirm is a real
// mutating write, same rate-limit convention as plans.routes.ts's
// /plans/generate and /recommendations/:id/decide.

nutritionRouter.post("/food-estimates", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createFoodEstimateSchema.parse(req.body);
    res.status(201).json(await nutritionService.createFoodEstimate(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post(
  "/food-estimates/:id/confirm",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = confirmFoodEstimateSchema.parse(req.body ?? {});
      res.json(await nutritionService.confirmFoodEstimate(req.userId!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);

// Barcode scan (R2 Wave, 22 Sep 2026) — see nutrition.service.ts's
// lookupBarcodeProduct and lib/openFoodFactsClient.ts for the full design.
// A real server-side proxy to Open Food Facts' public API: the mobile
// client never calls OFF directly, matching this codebase's
// backend-mediated third-party call convention (aiClient.ts). Read-only —
// no write, no rate-limit tied to spend like aiCoachRateLimit, just
// per-user abuse/good-citizenship bounding (see barcodeRateLimit's own
// comment).
nutritionRouter.get("/nutrition/barcode/:code", requireAuth, barcodeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = barcodeParamSchema.parse(req.params);
    res.json(await nutritionService.lookupBarcodeProduct(req.userId!, code));
  } catch (err) {
    next(err);
  }
});
