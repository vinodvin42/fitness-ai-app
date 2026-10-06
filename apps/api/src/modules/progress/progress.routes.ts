import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import {
  createProgressPhotoSchema,
  logMeasurementSchema,
  logMindfulnessSchema,
  submitCheckInSchema,
} from "./progress.schema";
import * as progressService from "./progress.service";
import * as progressAnalytics from "./progressAnalytics.service";

export const progressRouter = Router();

progressRouter.get("/progress/overview", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await progressService.getProgressOverview(req.userId!));
  } catch (err) {
    next(err);
  }
});

// Body Composition (Figma Progress 02) and rule-based Insights (Progress 07) -
// see progressAnalytics.service.ts for the data rules.
progressRouter.get("/progress/composition", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await progressAnalytics.getBodyComposition(req.userId!));
  } catch (err) {
    next(err);
  }
});

progressRouter.get("/progress/insights", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await progressAnalytics.getInsights(req.userId!));
  } catch (err) {
    next(err);
  }
});

progressRouter.get("/progress/streaks", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await progressService.getStreaks(req.userId!));
  } catch (err) {
    next(err);
  }
});

progressRouter.get("/measurements", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await progressService.listMeasurements(req.userId!) });
  } catch (err) {
    next(err);
  }
});

progressRouter.post("/measurements", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = logMeasurementSchema.parse(req.body);
    const measurement = await progressService.logMeasurement(req.userId!, input);
    res.status(201).json(measurement);
  } catch (err) {
    next(err);
  }
});

progressRouter.get("/progress-photos", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await progressService.listProgressPhotos(req.userId!) });
  } catch (err) {
    next(err);
  }
});

progressRouter.post("/progress-photos", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = createProgressPhotoSchema.parse(req.body);
    const photo = await progressService.createProgressPhoto(req.userId!, input);
    res.status(201).json(photo);
  } catch (err) {
    next(err);
  }
});

progressRouter.delete("/progress-photos/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await progressService.deleteProgressPhoto(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Check-In (U5, 15 Sep 2026) — see progress.service.ts's own doc comment.
// No writeRateLimit here — same "simple, non-AI, non-financial personal
// write" class as POST /measurements and POST /progress-photos above,
// neither of which carries it either.

progressRouter.get("/check-ins/status", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await progressService.getCheckInStatus(req.userId!));
  } catch (err) {
    next(err);
  }
});

progressRouter.get("/check-ins", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await progressService.listCheckIns(req.userId!) });
  } catch (err) {
    next(err);
  }
});

progressRouter.post("/check-ins", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = submitCheckInSchema.parse(req.body);
    const checkIn = await progressService.submitCheckIn(req.userId!, input);
    res.status(201).json(checkIn);
  } catch (err) {
    next(err);
  }
});

// Mindfulness log (22 Sep 2026, gap §29) — see progress.service.ts's own
// doc comment. No writeRateLimit — same class as POST /water-logs and
// POST /check-ins above.

progressRouter.get("/mindfulness-logs/today", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await progressService.getTodayMindfulnessLogs(req.userId!) });
  } catch (err) {
    next(err);
  }
});

progressRouter.post("/mindfulness-logs", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = logMindfulnessSchema.parse(req.body);
    const mindfulnessLog = await progressService.logMindfulness(req.userId!, input);
    res.status(201).json(mindfulnessLog);
  } catch (err) {
    next(err);
  }
});
