import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./adminAcquisition.service";
import {
  createCampaignSchema,
  getAcquisitionReportQuerySchema,
  listCampaignsQuerySchema,
  updateCampaignSchema,
} from "./adminAcquisition.schema";

/**
 * Module 07.04 — Campaigns & Attribution (added 20 Sep 2026, R2 Wave 4).
 * Gated on the `growth` permission module, same as `adminInfluencers.
 * routes.ts` and `adminReferrals.routes.ts` — Campaign management is a
 * Growth-module lever, same as Influencers/Referrals. See
 * adminAcquisition.service.ts's own doc comment for the full design.
 */
export const adminAcquisitionRouter = Router();

adminAcquisitionRouter.get(
  "/admin/acquisition/sources",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await service.listAcquisitionSources());
    } catch (err) {
      next(err);
    }
  },
);

adminAcquisitionRouter.get(
  "/admin/acquisition/campaigns",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (req, res, next) => {
    try {
      const query = listCampaignsQuerySchema.parse(req.query);
      res.status(200).json(await service.listCampaigns(query));
    } catch (err) {
      next(err);
    }
  },
);

adminAcquisitionRouter.post(
  "/admin/acquisition/campaigns",
  requireAdminAuth,
  requirePermission("growth", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createCampaignSchema.parse(req.body);
      res.status(201).json({ campaign: await service.createCampaign(req.adminUserId as string, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminAcquisitionRouter.patch(
  "/admin/acquisition/campaigns/:id",
  requireAdminAuth,
  requirePermission("growth", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateCampaignSchema.parse(req.body);
      res.status(200).json({ campaign: await service.updateCampaign(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

adminAcquisitionRouter.get(
  "/admin/acquisition/report",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (req, res, next) => {
    try {
      const query = getAcquisitionReportQuerySchema.parse(req.query);
      res.status(200).json(await service.getAcquisitionReport(query));
    } catch (err) {
      next(err);
    }
  },
);
