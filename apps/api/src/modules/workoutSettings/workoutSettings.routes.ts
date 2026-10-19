import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { exerciseRestSchema, updateWorkoutSettingsSchema } from "./workoutSettings.schema";
import * as workoutSettingsService from "./workoutSettings.service";

export const workoutSettingsRouter = Router();

workoutSettingsRouter.get("/users/me/workout-settings", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSettingsService.getWorkoutSettings(req.userId!));
  } catch (err) {
    next(err);
  }
});

workoutSettingsRouter.patch(
  "/users/me/workout-settings",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = updateWorkoutSettingsSchema.parse(req.body);
      res.json(await workoutSettingsService.updateWorkoutSettings(req.userId!, input));
    } catch (err) {
      next(err);
    }
  },
);

// Batch 3a (18 Oct 2026): rest time per exercise. See workoutSettings.service.ts.
workoutSettingsRouter.get("/users/me/exercise-rest", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSettingsService.listExerciseRest(req.userId!));
  } catch (err) {
    next(err);
  }
});

workoutSettingsRouter.put(
  "/users/me/exercise-rest/:exerciseId",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = exerciseRestSchema.parse(req.body);
      res.json(await workoutSettingsService.setExerciseRest(req.userId!, req.params.exerciseId, input.restSeconds));
    } catch (err) {
      next(err);
    }
  },
);

workoutSettingsRouter.delete(
  "/users/me/exercise-rest/:exerciseId",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      res.json(await workoutSettingsService.clearExerciseRest(req.userId!, req.params.exerciseId));
    } catch (err) {
      next(err);
    }
  },
);
