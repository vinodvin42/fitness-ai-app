import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { aiCoachRateLimit } from "../../middleware/rateLimit";
import { sendAiCoachMessageSchema } from "./aiCoach.schema";
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
    const result = await aiCoachService.sendMessage(req.userId!, input.content);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
