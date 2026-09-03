import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminSettlementsService from "./adminSettlements.service";
import {
  listSettlementsQuerySchema,
  setCommissionSchema,
  settleCoachSchema,
} from "./adminSettlements.schema";

/**
 * Module 10.06 — Coach Settlements (added 31 Aug 2026). Gated on the
 * `commerce` permission module, same as the rest of Finance (see
 * adminFinance.routes.ts / adminPermissions.ts — the `finance` role maps to
 * `commerce`).
 */
export const adminSettlementsRouter = Router();

adminSettlementsRouter.get(
  "/admin/settlements",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listSettlementsQuerySchema.parse(req.query);
      res.status(200).json(await adminSettlementsService.listSettlements(query));
    } catch (err) {
      next(err);
    }
  },
);

adminSettlementsRouter.patch(
  "/admin/settlements/commission/:professionalId",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = setCommissionSchema.parse(req.body);
      res
        .status(200)
        .json(await adminSettlementsService.setCommission(req.adminUserId as string, req.params.professionalId, input));
    } catch (err) {
      next(err);
    }
  },
);

adminSettlementsRouter.post(
  "/admin/settlements",
  requireAdminAuth,
  requirePermission("commerce", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = settleCoachSchema.parse(req.body);
      const settlement = await adminSettlementsService.settleCoach(req.adminUserId as string, input);
      res.status(201).json({ settlement });
    } catch (err) {
      next(err);
    }
  },
);
