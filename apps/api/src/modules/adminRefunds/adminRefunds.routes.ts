import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./adminRefunds.service";
import { createRefundSchema, listRefundsQuerySchema } from "./adminRefunds.schema";

/**
 * Module 06.04 — Refunds (added 31 Aug 2026). Gated on the `commerce`
 * permission module. See adminRefunds.service.ts.
 */
export const adminRefundsRouter = Router();

adminRefundsRouter.get(
  "/admin/refunds",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listRefundsQuerySchema.parse(req.query);
      res.status(200).json(await service.listRefunds(query));
    } catch (err) {
      next(err);
    }
  },
);

adminRefundsRouter.post(
  "/admin/payments/:paymentId/refunds",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createRefundSchema.parse(req.body);
      res.status(201).json({ refund: await service.createRefund(req.adminUserId as string, req.params.paymentId, input) });
    } catch (err) {
      next(err);
    }
  },
);
