import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./adminInfluencers.service";
import {
  createInfluencerSchema,
  createPayoutSchema,
  listInfluencersQuerySchema,
  updateInfluencerSchema,
} from "./adminInfluencers.schema";

/**
 * Module 07 Influencers + 10.07 Payouts (added 31 Aug 2026). Gated on the
 * `growth` permission module. See adminInfluencers.service.ts's doc comment.
 */
export const adminInfluencersRouter = Router();

adminInfluencersRouter.get(
  "/admin/influencers",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (req, res, next) => {
    try {
      const query = listInfluencersQuerySchema.parse(req.query);
      res.status(200).json(await service.listInfluencers(query));
    } catch (err) {
      next(err);
    }
  },
);

adminInfluencersRouter.get(
  "/admin/influencers/:id",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json(await service.getInfluencer(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

adminInfluencersRouter.post(
  "/admin/influencers",
  requireAdminAuth,
  requirePermission("growth", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createInfluencerSchema.parse(req.body);
      res.status(201).json({ influencer: await service.createInfluencer(req.adminUserId as string, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminInfluencersRouter.patch(
  "/admin/influencers/:id",
  requireAdminAuth,
  requirePermission("growth", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateInfluencerSchema.parse(req.body);
      res.status(200).json({ influencer: await service.updateInfluencer(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminInfluencersRouter.post(
  "/admin/influencers/:id/payouts",
  requireAdminAuth,
  requirePermission("growth", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createPayoutSchema.parse(req.body);
      res.status(201).json({ payout: await service.createPayout(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminInfluencersRouter.post(
  "/admin/payouts/:id/mark-paid",
  requireAdminAuth,
  requirePermission("growth", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      res.status(200).json({ payout: await service.markPayoutPaid(req.adminUserId as string, req.params.id) });
    } catch (err) {
      next(err);
    }
  },
);
