import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminDashboardService from "./adminDashboard.service";

export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  "/admin/dashboard/stats",
  requireAdminAuth,
  requirePermission("dashboard", "view"),
  async (_req, res, next) => {
    try {
      const stats = await adminDashboardService.getExecutiveDashboardStats();
      res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  },
);
