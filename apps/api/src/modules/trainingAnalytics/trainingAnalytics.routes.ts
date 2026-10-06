import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { analyticsQuerySchema } from "./trainingAnalytics.schema";
import * as trainingAnalyticsService from "./trainingAnalytics.service";

export const trainingAnalyticsRouter = Router();

trainingAnalyticsRouter.get("/training/analytics", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    res.json(await trainingAnalyticsService.getTrainingAnalytics(req.userId!, query));
  } catch (err) {
    next(err);
  }
});
