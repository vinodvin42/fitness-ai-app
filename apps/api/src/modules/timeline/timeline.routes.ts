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
