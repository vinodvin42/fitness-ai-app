import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./adminCoupons.service";
import { createCouponSchema, listCouponsQuerySchema, updateCouponSchema } from "./adminCoupons.schema";

/**
 * Module 06.05 — Coupons (added 31 Aug 2026). Gated on the `commerce`
 * permission module, same as Pricing/Plans. See adminCoupons.service.ts.
 */
export const adminCouponsRouter = Router();

adminCouponsRouter.get(
  "/admin/coupons",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listCouponsQuerySchema.parse(req.query);
      res.status(200).json(await service.listCoupons(query));
    } catch (err) {
      next(err);
    }
  },
);

adminCouponsRouter.post(
  "/admin/coupons",
  requireAdminAuth,
  requirePermission("commerce", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createCouponSchema.parse(req.body);
      res.status(201).json({ coupon: await service.createCoupon(req.adminUserId as string, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminCouponsRouter.patch(
  "/admin/coupons/:id",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateCouponSchema.parse(req.body);
      res.status(200).json({ coupon: await service.updateCoupon(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);
