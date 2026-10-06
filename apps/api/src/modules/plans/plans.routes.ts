import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { requireGuardianCleared } from "../../middleware/guardianGate";
import { decideRecommendationSchema } from "./plans.schema";
import * as plansService from "./plans.service";

export const plansRouter = Router();

// Plan-Generation / Recommendation Engine (14 Sep 2026) — see
// plans.service.ts's doc comment for the full design. Consumer-facing only
// (requireAuth) here. **20 Sep 2026 (Wave 2.4):** the professional review
// UI this comment used to describe as future work is real now — see
// apps/api/src/modules/professionalClients/professionalClients.routes.ts's
// POST /professionals/me/clients/:userId/recommendations/:id/decide, a
// thin professional-authed route that calls this same module's
// decideRecommendation() with decidedByRole: "professional" rather than
// duplicating this router's logic.

plansRouter.post("/plans/generate", requireAuth, requireGuardianCleared, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.status(201).json(await plansService.generatePlan(req.userId!));
  } catch (err) {
    next(err);
  }
});

plansRouter.post("/plans/:id/retry", requireAuth, requireGuardianCleared, writeRateLimit, async (req: AuthedRequest, res, next) => {
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

plansRouter.post("/recommendations/generate", requireAuth, requireGuardianCleared, writeRateLimit, async (req: AuthedRequest, res, next) => {
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
