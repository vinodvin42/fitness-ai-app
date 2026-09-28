import { z } from "zod";
import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { decideRecommendationSchema } from "../plans/plans.schema";
import * as professionalClientsService from "./professionalClients.service";

/**
 * Coach Client Profile (docs/coach/03-screen-inventory.md §D), added 31 Aug
 * 2026 — professional-authed throughout (the coach's OWN clients), same
 * `requireProfessionalAuth` guard as professionalDashboard's routes. See
 * professionalClients.service.ts's doc comment for the authorization and
 * sensitive-data boundaries.
 *
 * The `/recommendations` routes below (Wave 2.4, 20 Sep 2026) are the
 * professional-authed counterpart plans.routes.ts's own top comment named
 * as future work: reuses `decideRecommendationSchema` from plans.schema.ts
 * unchanged (same "accept"/"decline"/"modify" body shape a self-serve
 * user's decide call already uses) rather than duplicating it.
 */
export const professionalClientsRouter = Router();

professionalClientsRouter.get(
  "/professionals/me/clients",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await professionalClientsService.listClients(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

professionalClientsRouter.get(
  "/professionals/me/clients/:userId",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(
        await professionalClientsService.getClientProfile(
          req.professionalId as string,
          req.params.userId,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// Client 360 (Wave 2, 20 Sep 2026) — real assessment/training/nutrition/
// check-in summaries, gated on the client's own health_data_processing
// Consent, not just the active-Relationship check above. See
// professionalClients.service.ts's getClientSummary doc comment for the
// full design.
professionalClientsRouter.get(
  "/professionals/me/clients/:userId/summary",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(
        await professionalClientsService.getClientSummary(
          req.professionalId as string,
          req.params.userId,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

professionalClientsRouter.get(
  "/professionals/me/clients/:userId/recommendations",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(
        await professionalClientsService.listClientRecommendations(
          req.professionalId as string,
          req.params.userId,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

professionalClientsRouter.post(
  "/professionals/me/clients/:userId/recommendations/:id/decide",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = decideRecommendationSchema.parse(req.body);
      res.json(
        await professionalClientsService.decideClientRecommendation(
          req.professionalId as string,
          req.params.userId,
          req.params.id,
          input,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * P-M12 — the client safety flag. A professional noticing something
 * concerning had nowhere to put it except a chat message, which nobody
 * monitors and which is not an escalation.
 */
const safetyFlagSchema = z.object({
  concern: z.string().trim().min(10).max(2000),
  /** Urgent raises the queue severity; it does not page anyone. */
  urgent: z.boolean().default(false),
});

professionalClientsRouter.post(
  "/professionals/me/clients/:userId/safety-flag",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = safetyFlagSchema.parse(req.body);
      res.status(201).json(
        await professionalClientsService.flagClientSafety(req.professionalId as string, req.params.userId, input),
      );
    } catch (err) {
      next(err);
    }
  },
);
