import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import * as timelineService from "./timeline.service";

export const timelineRouter = Router();

timelineRouter.get("/timeline", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await timelineService.listTimelineEvents(req.userId!) });
  } catch (err) {
    next(err);
  }
});

// Figma Progress 08-11: summary stats, one month's detail, and the Journey
// Report - all composed from the same real logs as GET /timeline.
timelineRouter.get("/timeline/summary", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await timelineService.getTimelineSummary(req.userId!));
  } catch (err) {
    next(err);
  }
});

timelineRouter.get("/timeline/report", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await timelineService.getJourneyReport(req.userId!));
  } catch (err) {
    next(err);
  }
});

// month is 0-11, same as the client's Date.getMonth().
timelineRouter.get("/timeline/months/:year/:month", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await timelineService.getTimelineMonth(req.userId!, Number(req.params.year), Number(req.params.month)));
  } catch (err) {
    next(err);
  }
});
