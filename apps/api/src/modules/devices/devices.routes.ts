import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { pairDeviceSchema, syncDeviceSchema, updateDeviceSchema } from "./devices.schema";
import * as devicesService from "./devices.service";

/**
 * Mounted AFTER notificationsRouter so DELETE /devices/push-token is not
 * swallowed by DELETE /devices/:id.
 */
export const devicesRouter = Router();

devicesRouter.get("/devices", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await devicesService.listDevices(req.userId!));
  } catch (err) {
    next(err);
  }
});

devicesRouter.get("/devices/sync-status", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await devicesService.getSyncStatus(req.userId!));
  } catch (err) {
    next(err);
  }
});

devicesRouter.get("/devices/streams", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await devicesService.getDataStreams(req.userId!));
  } catch (err) {
    next(err);
  }
});

devicesRouter.patch("/devices/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateDeviceSchema.parse(req.body);
    res.json(await devicesService.updateDevice(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

devicesRouter.post("/devices", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = pairDeviceSchema.parse(req.body);
    res.status(201).json(await devicesService.pairDevice(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

devicesRouter.delete("/devices/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await devicesService.removeDevice(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

devicesRouter.post("/devices/:id/sync", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = syncDeviceSchema.parse(req.body);
    res.json(await devicesService.syncDevice(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});
