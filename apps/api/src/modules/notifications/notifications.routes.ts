import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import {
  listNotificationsQuerySchema,
  registerPushTokenSchema,
  removePushTokenSchema,
} from "./notifications.schema";
import * as notificationsService from "./notifications.service";

export const notificationsRouter = Router();

notificationsRouter.get("/notifications", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = listNotificationsQuerySchema.parse(req.query);
    res.json(await notificationsService.listNotifications(req.userId!, query));
  } catch (err) {
    next(err);
  }
});

// Registered before "/notifications/:id/read" so "read-all" is never
// treated as an :id.
notificationsRouter.post("/notifications/read-all", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await notificationsService.markAllRead(req.userId!));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/notifications/:id/read", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await notificationsService.markRead(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/devices/push-token", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = registerPushTokenSchema.parse(req.body);
    res.status(201).json(await notificationsService.registerPushToken(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.delete("/devices/push-token", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = removePushTokenSchema.parse(req.body);
    await notificationsService.removePushToken(req.userId!, input.token);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
