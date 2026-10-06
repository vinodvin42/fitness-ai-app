import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { activitySummaryQuerySchema, createActivitySchema, listActivitiesQuerySchema } from "./activities.schema";
import * as activitiesService from "./activities.service";

export const activitiesRouter = Router();

activitiesRouter.get("/activities", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = listActivitiesQuerySchema.parse(req.query);
    res.json(await activitiesService.listActivities(req.userId!, query));
  } catch (err) {
    next(err);
  }
});

// Mounted before "/activities/:id" so "summary" isn't swallowed as an id.
activitiesRouter.get("/activities/summary", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = activitySummaryQuerySchema.parse(req.query);
    res.json(await activitiesService.getActivitySummary(req.userId!, query));
  } catch (err) {
    next(err);
  }
});

activitiesRouter.post("/activities", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createActivitySchema.parse(req.body);
    res.status(201).json(await activitiesService.createActivity(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

activitiesRouter.get("/activities/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await activitiesService.getActivity(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

activitiesRouter.delete("/activities/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await activitiesService.deleteActivity(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});
