import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { getAiProviderStatus } from "../../lib/aiClient";

export const aiRouter = Router();

/**
 * Gap §13's infrastructure half only — see lib/aiClient.ts's doc comment.
 * Lets the client (or a developer) confirm whether an AI provider is
 * actually configured on this server, without exposing the key itself.
 * No AI Coach feature reads from this yet.
 */
aiRouter.get("/ai/status", requireAuth, (_req, res) => {
  res.json(getAiProviderStatus());
});
