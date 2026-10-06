import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { createRoutineSchema, updateRoutineSchema } from "./routines.schema";
import * as routinesService from "./routines.service";

export const routinesRouter = Router();

routinesRouter.get("/routines", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await routinesService.listRoutines(req.userId!));
  } catch (err) {
    next(err);
  }
});

routinesRouter.post("/routines", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createRoutineSchema.parse(req.body);
    res.status(201).json(await routinesService.createRoutine(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

routinesRouter.get("/routines/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await routinesService.getRoutine(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

routinesRouter.patch("/routines/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateRoutineSchema.parse(req.body);
    res.json(await routinesService.updateRoutine(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

routinesRouter.delete("/routines/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await routinesService.deleteRoutine(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

routinesRouter.post("/routines/:id/start", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.status(201).json(await routinesService.startRoutine(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});
