import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { createProgressPhotoSchema, logMeasurementSchema } from "./progress.schema";
import * as progressService from "./progress.service";

export const progressRouter = Router();

progressRouter.get("/progress/overview", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await progressService.getProgressOverview(req.userId!));
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
