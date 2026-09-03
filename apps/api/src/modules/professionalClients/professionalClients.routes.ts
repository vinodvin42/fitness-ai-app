import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import * as professionalClientsService from "./professionalClients.service";

/**
 * Coach Client Profile (docs/coach/03-screen-inventory.md §D), added 31 Aug
 * 2026 — professional-authed throughout (the coach's OWN clients), same
 * `requireProfessionalAuth` guard as professionalDashboard's routes. See
 * professionalClients.service.ts's doc comment for the authorization and
 * sensitive-data boundaries.
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
