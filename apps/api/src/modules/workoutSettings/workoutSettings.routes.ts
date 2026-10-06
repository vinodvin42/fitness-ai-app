import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { updateWorkoutSettingsSchema } from "./workoutSettings.schema";
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
