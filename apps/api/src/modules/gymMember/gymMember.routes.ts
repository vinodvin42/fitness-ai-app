import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { createHelpRequestSchema } from "./gymMember.schema";
import * as service from "./gymMember.service";

/** Member-facing "My Gym" endpoints. Every route requires a linked partner gym (else 404 gym_not_linked). */
export const gymMemberRouter = Router();

gymMemberRouter.get("/gym/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.getMyGym(req.userId!));
  } catch (err) {
    next(err);
  }
});

gymMemberRouter.get("/gym/workout/today", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.getTodayGymWorkout(req.userId!));
  } catch (err) {
    next(err);
  }
});

gymMemberRouter.get("/gym/help-requests", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.listMyHelpRequests(req.userId!));
  } catch (err) {
    next(err);
  }
});

gymMemberRouter.post("/gym/help-requests", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createHelpRequestSchema.parse(req.body);
    res.status(201).json(await service.createHelpRequest(req.userId!, input));
  } catch (err) {
    next(err);
  }
});
