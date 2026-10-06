import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { connectHealthSchema } from "./healthConnections.schema";
import * as healthService from "./healthConnections.service";

export const healthConnectionsRouter = Router();

healthConnectionsRouter.get("/health-connections", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await healthService.listConnections(req.userId!));
  } catch (err) {
    next(err);
  }
});

healthConnectionsRouter.post("/health-connections", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = connectHealthSchema.parse(req.body);
    res.status(201).json(await healthService.connect(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

// Revokes (soft) rather than deletes, so the consent history stays visible.
healthConnectionsRouter.delete("/health-connections/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await healthService.revoke(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});
