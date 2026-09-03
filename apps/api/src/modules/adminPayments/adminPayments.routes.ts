import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listPaymentsQuerySchema } from "./adminPayments.schema";
import * as adminPaymentsService from "./adminPayments.service";

export const adminPaymentsRouter = Router();

adminPaymentsRouter.get(
  "/admin/payments",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listPaymentsQuerySchema.parse(req.query);
      const result = await adminPaymentsService.listPayments(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminPaymentsRouter.get(
  "/admin/payments/:id",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const result = await adminPaymentsService.getPaymentDetail(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
