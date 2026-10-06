import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { updateNotificationPreferencesSchema } from "./notificationPreferences.schema";
import * as prefsService from "./notificationPreferences.service";

export const notificationPreferencesRouter = Router();

notificationPreferencesRouter.get("/users/me/notification-preferences", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await prefsService.getPreferences(req.userId!));
  } catch (err) {
    next(err);
  }
});

notificationPreferencesRouter.patch("/users/me/notification-preferences", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateNotificationPreferencesSchema.parse(req.body);
    res.json(await prefsService.updatePreferences(req.userId!, input));
  } catch (err) {
    next(err);
  }
});
