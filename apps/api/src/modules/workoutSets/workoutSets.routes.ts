import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { updateSetSchema } from "./workoutSets.schema";
import * as workoutSetsService from "./workoutSets.service";

export const workoutSetsRouter = Router();

workoutSetsRouter.patch("/workout-sessions/:id/sets/:setId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateSetSchema.parse(req.body);
    res.json(await workoutSetsService.updateSet(req.params.id, req.params.setId, req.userId!, input));
  } catch (err) {
    next(err);
  }
});

workoutSetsRouter.delete("/workout-sessions/:id/sets/:setId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSetsService.deleteSet(req.params.id, req.params.setId, req.userId!));
  } catch (err) {
    next(err);
  }
});
