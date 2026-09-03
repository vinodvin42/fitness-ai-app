import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import * as professionalDashboardService from "./professionalDashboard.service";

export const professionalDashboardRouter = Router();

professionalDashboardRouter.get(
  "/professionals/me/dashboard",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const stats = await professionalDashboardService.getDashboardStats(req.professionalId as string);
      res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  },
);

// Coach Earnings (31 Aug 2026) — the coach-facing counterpart to the admin
// Settlements module. See professionalDashboard.service.ts's getEarnings.
professionalDashboardRouter.get(
  "/professionals/me/earnings",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.status(200).json(await professionalDashboardService.getEarnings(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);
