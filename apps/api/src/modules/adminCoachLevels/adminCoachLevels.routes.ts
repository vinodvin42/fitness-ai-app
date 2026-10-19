import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as svc from "./adminCoachLevels.service";
import {
  assignCoachLevelSchema,
  createLevelSchema,
  createServiceSchema,
  setCoachCommissionSchema,
  setDefaultCommissionSchema,
  setLevelFeeSchema,
  updateLevelSchema,
  updateServiceSchema,
} from "./adminCoachLevels.schema";

/**
 * Coach levels, services, fees and FynroX commission (blueprint 4.3,
 * Package 4). Money settings live under `commerce`; placing a coach in a
 * level is `professionals` edit. Both are approval modules: only the Super
 * Admin's changes apply directly (maker-checker, D21).
 */
export const adminCoachLevelsRouter = Router();

adminCoachLevelsRouter.get(
  "/admin/coach-levels",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (_req: AdminAuthedRequest, res, next) => {
    try {
      res.status(200).json(await svc.getCoachPricing());
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/coach-levels",
  requireAdminAuth,
  requirePermission("commerce", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = createLevelSchema.parse(req.body);
      res.status(201).json({ level: await svc.createLevel(adminId, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.patch(
  "/admin/coach-levels/:id",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = updateLevelSchema.parse(req.body);
      res.status(200).json({ level: await svc.updateLevel(adminId, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/coach-levels/:id/fees",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = setLevelFeeSchema.parse(req.body);
      res.status(201).json({ fee: await svc.setLevelFee(adminId, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/coach-fees/:feeId/cancel",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      res.status(200).json({ fee: await svc.cancelLevelFee(adminId, req.params.feeId) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/coach-services",
  requireAdminAuth,
  requirePermission("commerce", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = createServiceSchema.parse(req.body);
      res.status(201).json({ service: await svc.createService(adminId, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.patch(
  "/admin/coach-services/:id",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = updateServiceSchema.parse(req.body);
      res.status(200).json({ service: await svc.updateService(adminId, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/commission-rates/default",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = setDefaultCommissionSchema.parse(req.body);
      res.status(201).json({ rate: await svc.setDefaultCommission(adminId, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/professionals/:id/commission",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = setCoachCommissionSchema.parse(req.body);
      res.status(201).json({ rate: await svc.setCoachCommission(adminId, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.post(
  "/admin/commission-rates/:rateId/cancel",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      res.status(200).json({ rate: await svc.cancelCommissionRate(adminId, req.params.rateId) });
    } catch (err) {
      next(err);
    }
  },
);

adminCoachLevelsRouter.put(
  "/admin/professionals/:id/coach-level",
  requireAdminAuth,
  requirePermission("professionals", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminId = req.adminUserId as string;
      const input = assignCoachLevelSchema.parse(req.body);
      res.status(200).json({ professional: await svc.assignCoachLevel(adminId, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);
