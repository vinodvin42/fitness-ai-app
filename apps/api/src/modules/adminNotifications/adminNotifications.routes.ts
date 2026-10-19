import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminNotificationsService from "./adminNotifications.service";

// 12.07 Notifications (Oct 2026) — read-only, under the existing "admin"
// scope like the rest of Admin & System. See adminNotifications.service.ts.
export const adminNotificationsRouter = Router();

adminNotificationsRouter.get(
  "/admin/notifications/overview",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await adminNotificationsService.getNotificationsOverview());
    } catch (err) {
      next(err);
    }
  },
);
