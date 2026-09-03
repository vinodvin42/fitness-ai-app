import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminPlansService from "./adminPlans.service";
import { createPlanSchema, listPlansQuerySchema, updatePlanSchema } from "./adminPlans.schema";

export const adminPlansRouter = Router();

adminPlansRouter.get(
  "/admin/plans",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listPlansQuerySchema.parse(req.query);
      res.status(200).json(await adminPlansService.listPlans(query));
    } catch (err) {
      next(err);
    }
  },
);

adminPlansRouter.post(
  "/admin/plans",
  requireAdminAuth,
  requirePermission("commerce", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createPlanSchema.parse(req.body);
      const plan = await adminPlansService.createPlan(req.adminUserId as string, input);
      res.status(201).json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

adminPlansRouter.patch(
  "/admin/plans/:id",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updatePlanSchema.parse(req.body);
      const plan = await adminPlansService.updatePlan(req.adminUserId as string, req.params.id, input);
      res.status(200).json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

adminPlansRouter.post(
  "/admin/plans/:id/archive",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const plan = await adminPlansService.archivePlan(req.adminUserId as string, req.params.id);
      res.status(200).json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

adminPlansRouter.post(
  "/admin/plans/:id/reactivate",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const plan = await adminPlansService.reactivatePlan(req.adminUserId as string, req.params.id);
      res.status(200).json({ plan });
    } catch (err) {
      next(err);
    }
  },
);
