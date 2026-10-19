import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import {
  addSessionExerciseSchema,
  logSetSchema,
  sessionFeelSchema,
  updateProgressSchema,
  updateSessionExerciseSchema,
} from "./workoutSessions.schema";
import * as workoutSessionsService from "./workoutSessions.service";
import * as sessionExercisesService from "./sessionExercises.service";

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

// U3 (15 Sep 2026) — see workoutSessions.service.ts's updateProgress comment.
workoutSessionsRouter.patch("/workout-sessions/:id/progress", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateProgressSchema.parse(req.body);
    res.json(await workoutSessionsService.updateProgress(req.params.id, req.userId!, input.currentExerciseIndex));
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

// ---- Batch 3a (18 Oct 2026): the session's own exercise list and "How did it feel?" ----
// No writeRateLimit, same as POST /sets: these are in-workout taps.

workoutSessionsRouter.post("/workout-sessions/:id/exercises", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = addSessionExerciseSchema.parse(req.body);
    res.status(201).json({ exercises: await sessionExercisesService.addSessionExercise(req.params.id, req.userId!, input) });
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.patch("/workout-sessions/:id/exercises/:sessionExerciseId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateSessionExerciseSchema.parse(req.body);
    res.json({
      exercises: await sessionExercisesService.updateSessionExercise(req.params.id, req.params.sessionExerciseId, req.userId!, input),
    });
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.delete("/workout-sessions/:id/exercises/:sessionExerciseId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ exercises: await sessionExercisesService.removeSessionExercise(req.params.id, req.params.sessionExerciseId, req.userId!) });
  } catch (err) {
    next(err);
  }
});

workoutSessionsRouter.patch("/workout-sessions/:id/feel", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = sessionFeelSchema.parse(req.body);
    res.json(await workoutSessionsService.setSessionFeel(req.params.id, req.userId!, input.feel));
  } catch (err) {
    next(err);
  }
});
