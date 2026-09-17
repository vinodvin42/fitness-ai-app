import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listAnalyticsEventsQuerySchema } from "./adminAnalyticsEvents.schema";
import * as adminAnalyticsEventsService from "./adminAnalyticsEvents.service";

// U7 (15 Sep 2026) — reuses the existing "analytics"/"view" permission
// scope adminAnalytics.routes.ts already established, rather than
// inventing a new scope for what is, from an admin-console permissions
// point of view, the same real capability ("read analytics data").
export const adminAnalyticsEventsRouter = Router();

adminAnalyticsEventsRouter.get(
  "/admin/analytics-events",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (req, res, next) => {
    try {
      const query = listAnalyticsEventsQuerySchema.parse(req.query);
      const result = await adminAnalyticsEventsService.listAnalyticsEvents(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
