import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminAiOpsService from "./adminAiOps.service";
import { updateAiCoachSettingsSchema } from "./adminAiOps.schema";

// No new AdminModule permission key — reuses the existing "admin" scope,
// same reasoning as adminFinance.routes.ts's "Finance collapses into
// Commerce". See adminAiOps.service.ts's top comment for the full module
// scope and why.
export const adminAiOpsRouter = Router();

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
