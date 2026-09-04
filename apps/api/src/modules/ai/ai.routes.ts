import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { getAiProviderStatus } from "../../lib/aiClient";

export const aiRouter = Router();

/**
 * See lib/aiClient.ts's doc comment. Lets the client (or a developer)
 * confirm whether an AI provider is actually configured on this server —
 * and which one/model — without exposing the key itself.
 */
aiRouter.get("/ai/status", requireAuth, (_req, res) => {
  res.json(getAiProviderStatus());
});
