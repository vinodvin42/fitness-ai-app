import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { decideRecommendationSchema } from "./plans.schema";
import * as plansService from "./plans.service";

export const plansRouter = Router();

// Plan-Generation / Recommendation Engine (14 Sep 2026) — see
// plans.service.ts's doc comment for the full design. Consumer-facing
// only (requireAuth) in this pass — Developer 2's future professional
// review UI calls decideRecommendation() with decidedByRole: "professional"
// directly rather than through this router, since that needs professional
// auth + its own Decision Record, both Developer 2's own scope.

plansRouter.post("/plans/generate", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.status(201).json(await plansService.generatePlan(req.userId!));
  } catch (err) {
    next(err);
  }
});

plansRouter.post("/plans/:id/retry", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await plansService.retryPlanGeneration(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

plansRouter.get("/plans/current", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const plan = await plansService.getCurrentPlan(req.userId!);
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

// U3 (15 Sep 2026) — see plans.service.ts's getNextWorkoutForActivePlan comment.
plansRouter.get("/plans/current/next-workout", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ nextWorkout: await plansService.getNextWorkoutForActivePlan(req.userId!) });
  } catch (err) {
    next(err);
  }
});

plansRouter.get("/plans", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await plansService.listPlans(req.userId!) });
  } catch (err) {
    next(err);
  }
});

plansRouter.post("/recommendations/generate", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.status(201).json(await plansService.generateRecommendation(req.userId!));
  } catch (err) {
    next(err);
  }
});

plansRouter.get("/recommendations/current", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const recommendation = await plansService.getCurrentRecommendation(req.userId!);
    res.json({ recommendation });
  } catch (err) {
    next(err);
  }
});

plansRouter.post(
  "/recommendations/:id/decide",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = decideRecommendationSchema.parse(req.body);
      res.json(await plansService.decideRecommendation(req.userId!, req.params.id, input, "user"));
    } catch (err) {
      next(err);
    }
  },
);
