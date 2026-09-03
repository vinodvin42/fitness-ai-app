import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import * as programsService from "./programs.service";

export const programsRouter = Router();

programsRouter.get("/programs", requireAuth, async (_req, res, next) => {
  try {
    res.json({ items: await programsService.listPrograms() });
  } catch (err) {
    next(err);
  }
});

programsRouter.get("/programs/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await programsService.getProgramDetail(req.params.id, req.userId!));
  } catch (err) {
    next(err);
  }
});

programsRouter.get("/workouts/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await programsService.getWorkoutDetail(req.params.id, req.userId!));
  } catch (err) {
    next(err);
  }
});

programsRouter.get("/exercises", requireAuth, async (_req, res, next) => {
  try {
    res.json({ items: await programsService.listExercises() });
  } catch (err) {
    next(err);
  }
});

programsRouter.get("/exercises/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await programsService.getExerciseDetail(req.params.id));
  } catch (err) {
    next(err);
  }
});

programsRouter.get("/recipes", requireAuth, async (_req, res, next) => {
  try {
    res.json({ items: await programsService.listRecipes() });
  } catch (err) {
    next(err);
  }
});

programsRouter.get("/recipes/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await programsService.getRecipeDetail(req.params.id));
  } catch (err) {
    next(err);
  }
});
