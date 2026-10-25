import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { alertsQuerySchema } from "./professionalAlerts.schema";
import * as professionalAlertsService from "./professionalAlerts.service";

export const professionalAlertsRouter = Router();

// The coach app's Alerts badge (25 Oct 2026). See professionalAlerts.service.ts.
professionalAlertsRouter.get(
  "/professionals/me/alerts",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const query = alertsQuerySchema.parse(req.query);
      res.status(200).json(await professionalAlertsService.getAlerts(req.professionalId as string, query));
    } catch (err) {
      next(err);
    }
  },
);
