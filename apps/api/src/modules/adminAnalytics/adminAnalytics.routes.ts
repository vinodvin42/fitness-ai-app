import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { getUserAnalyticsQuerySchema } from "./adminAnalytics.schema";
import * as adminAnalyticsService from "./adminAnalytics.service";

export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get(
  "/admin/analytics/users",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (req, res, next) => {
    try {
      const query = getUserAnalyticsQuerySchema.parse(req.query);
      const result = await adminAnalyticsService.getUserAnalytics(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// 09.02 Engagement and 09.03 Fitness & Nutrition, added 26 Aug 2026 — same
// date-range query shape as 09.01, same "analytics" permission scope. See
// adminAnalytics.service.ts's top comment for why these are now real,
// separate screens rather than folded into 09.01's tabs.
adminAnalyticsRouter.get(
  "/admin/analytics/engagement",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (req, res, next) => {
    try {
      const query = getUserAnalyticsQuerySchema.parse(req.query);
      const result = await adminAnalyticsService.getEngagementAnalytics(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminAnalyticsRouter.get(
  "/admin/analytics/fitness-nutrition",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (req, res, next) => {
    try {
      const query = getUserAnalyticsQuerySchema.parse(req.query);
      const result = await adminAnalyticsService.getFitnessNutritionAnalytics(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// 09.06 Unit Economics / Cohorts, added 27 Aug 2026 — same date-range
// query shape and "analytics" permission scope as the other three. See
// adminAnalytics.service.ts's `getUnitEconomics` doc comment for why this
// turned out not to need a new product decision.
adminAnalyticsRouter.get(
  "/admin/analytics/unit-economics",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (req, res, next) => {
    try {
      const query = getUserAnalyticsQuerySchema.parse(req.query);
      const result = await adminAnalyticsService.getUnitEconomics(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// 09.04 Business Analytics, added 31 Aug 2026 — unblocked once per-coach
// commission + Coach Settlements shipped this same pass (the take-rate
// decision it was waiting on). No date-range query — marketplace economics
// are all-time totals. See adminAnalytics.service.ts's getBusinessAnalytics.
adminAnalyticsRouter.get(
  "/admin/analytics/business",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await adminAnalyticsService.getBusinessAnalytics());
    } catch (err) {
      next(err);
    }
  },
);
