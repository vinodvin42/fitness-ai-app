import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { logSetSchema } from "./workoutSessions.schema";
import * as workoutSessionsService from "./workoutSessions.service";

export const workoutSessionsRouter = Router();

workoutSessionsRouter.post("/workouts/:workoutId/sessions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const session = await workoutSessionsService.startSession(req.userId!, req.params.workoutId);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.get("/workout-sessions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await workoutSessionsService.listHistory(req.userId!) });
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.get("/workout-sessions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSessionsService.getSession(req.params.id, req.userId!));
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.get("/workout-sessions/:id/summary", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSessionsService.getSessionSummary(req.params.id, req.userId!));
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.post("/workout-sessions/:id/sets", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = logSetSchema.parse(req.body);
    const setLog = await workoutSessionsService.logSet(req.params.id, req.userId!, input);
    res.status(201).json(setLog);
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.post("/workout-sessions/:id/complete", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSessionsService.completeSession(req.params.id, req.userId!));
  } catch (err) {
    next(err);
  }
});

// 20 Aug 2026, gap §33's explicit-button half — see workoutSessions.service.ts's abandonSession comment.
workoutSessionsRouter.post("/workout-sessions/:id/abandon", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await workoutSessionsService.abandonSession(req.params.id, req.userId!));
  } catch (err) {
    next(err);
  }
});
