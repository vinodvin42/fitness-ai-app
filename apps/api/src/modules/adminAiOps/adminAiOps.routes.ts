import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminAiOpsService from "./adminAiOps.service";
import {
  aiUsageQuerySchema,
  listAiAnswerReportsQuerySchema,
  resolveAiAnswerReportSchema,
  updateAiCoachSettingsSchema,
} from "./adminAiOps.schema";

// No new AdminModule permission key — reuses the existing "admin" scope,
// same reasoning as adminFinance.routes.ts's "Finance collapses into
// Commerce". See adminAiOps.service.ts's top comment for the full module
// scope and why.
export const adminAiOpsRouter = Router();

// 11.02 AI Usage & Metrics (Oct 2026). Aggregates only, so the analytics
// permission fits (see getAiUsage's comment).
adminAiOpsRouter.get(
  "/admin/ai-ops/usage",
  requireAdminAuth,
  requirePermission("analytics", "view"),
  async (req, res, next) => {
    try {
      const query = aiUsageQuerySchema.parse(req.query);
      res.status(200).json(await adminAiOpsService.getAiUsage(query));
    } catch (err) {
      next(err);
    }
  },
);

adminAiOpsRouter.get(
  "/admin/ai-ops/ai-coach",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await adminAiOpsService.getAiCoachSettings());
    } catch (err) {
      next(err);
    }
  },
);

adminAiOpsRouter.patch(
  "/admin/ai-ops/ai-coach",
  requireAdminAuth,
  requirePermission("admin", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateAiCoachSettingsSchema.parse(req.body);
      const settings = await adminAiOpsService.updateAiCoachSettings(req.adminUserId as string, input);
      res.status(200).json(settings);
    } catch (err) {
      next(err);
    }
  },
);

// 11.03 AI Safety / Overrides (Oct 2026). Reported AI Coach answers are
// health conversations, so these need `sensitiveData` (Super Admin and the
// safety/privacy role). See listAiAnswerReports in adminAiOps.service.ts.
adminAiOpsRouter.get(
  "/admin/ai-ops/reports",
  requireAdminAuth,
  requirePermission("sensitiveData", "view"),
  async (req, res, next) => {
    try {
      const query = listAiAnswerReportsQuerySchema.parse(req.query);
      res.status(200).json(await adminAiOpsService.listAiAnswerReports(query));
    } catch (err) {
      next(err);
    }
  },
);

adminAiOpsRouter.get(
  "/admin/ai-ops/reports/:id",
  requireAdminAuth,
  requirePermission("sensitiveData", "view"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      res.status(200).json(await adminAiOpsService.getAiAnswerReport(req.adminUserId as string, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

adminAiOpsRouter.post(
  "/admin/ai-ops/reports/:id/resolve",
  requireAdminAuth,
  requirePermission("sensitiveData", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = resolveAiAnswerReportSchema.parse(req.body);
      res.status(200).json(await adminAiOpsService.resolveAiAnswerReport(req.adminUserId as string, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
