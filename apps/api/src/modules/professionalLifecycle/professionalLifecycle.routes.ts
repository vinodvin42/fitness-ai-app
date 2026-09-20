import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { updateMaxActiveClientsSchema } from "./professionalLifecycle.schema";
import * as professionalLifecycleService from "./professionalLifecycle.service";

/**
 * R2 Wave 1 (20 Sep 2026) — the professional's own read on their
 * account-level lifecycle stage, plus the real capacity ("Availability
 * toggle") update the wave's §4 calls for. No coach-mobile UI reads these
 * yet (later wave) — see professionalLifecycle.service.ts's top comment.
 */
export const professionalLifecycleRouter = Router();

professionalLifecycleRouter.get(
  "/professionals/me/lifecycle",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const summary = await professionalLifecycleService.getLifecycleSummary(req.professionalId as string);
      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  },
);

professionalLifecycleRouter.put(
  "/professionals/me/capacity",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = updateMaxActiveClientsSchema.parse(req.body);
      const professionalId = req.professionalId as string;
      const updated = await professionalLifecycleService.updateMaxActiveClients(professionalId, input, {
        professionalId,
      });
      res.status(200).json({ maxActiveClients: updated.maxActiveClients });
    } catch (err) {
      next(err);
    }
  },
);
