import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { aiCoachRateLimit, writeRateLimit } from "../../middleware/rateLimit";
import { reportAiAnswerSchema, sendAiCoachMessageSchema } from "./aiCoach.schema";
import * as aiCoachService from "./aiCoach.service";

export const aiCoachRouter = Router();

aiCoachRouter.get("/ai-coach/messages", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await aiCoachService.listMessages(req.userId!));
  } catch (err) {
    next(err);
  }
});

// Rate-limited (unlike every other GET in this app) — this is the one
// endpoint that spends real money per call. See aiCoach.service.ts's own
// doc comment and middleware/rateLimit.ts's aiCoachRateLimit.
aiCoachRouter.post("/ai-coach/messages", requireAuth, aiCoachRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = sendAiCoachMessageSchema.parse(req.body);
    const result = await aiCoachService.sendMessage(req.userId!, input.content, input.clientId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

aiCoachRouter.get("/ai-coach/usage", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const usage = await aiCoachService.getUsage(req.userId!);
    res.json({ ...usage, resetsAt: usage.resetsAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

// Clears the caller's own conversation only (scoped by userId in the service).
aiCoachRouter.delete("/ai-coach/messages", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await aiCoachService.clearConversation(req.userId!));
  } catch (err) {
    next(err);
  }
});

// AI Safety (Oct 2026): report one of your own AI Coach answers. See
// aiCoach.service.ts reportAnswer().
aiCoachRouter.post("/ai-coach/messages/:id/report", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = reportAiAnswerSchema.parse(req.body);
    res.status(201).json(await aiCoachService.reportAnswer(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});
