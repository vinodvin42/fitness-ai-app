import { Router } from "express";
import { InfluencerAuthedRequest, requireInfluencerAuth } from "../../middleware/influencerAuth";
import * as service from "./influencerPortal.service";
import { getInfluencerAcquisitionReportQuerySchema } from "./influencerPortal.schema";

/**
 * Creator Portal self-service (R2 Wave 5, 21 Sep 2026) — see
 * influencerPortal.service.ts's own doc comment. Every handler reads the
 * influencer id ONLY from `req.influencerId` (set by `requireInfluencerAuth`
 * from the caller's own verified access token) — never from `req.params`
 * or `req.body` — so this module has no route that could ever be asked to
 * return another influencer's data.
 */
export const influencerPortalRouter = Router();

influencerPortalRouter.get(
  "/influencer-portal/me",
  requireInfluencerAuth,
  async (req: InfluencerAuthedRequest, res, next) => {
    try {
      res.status(200).json({ influencer: await service.getOwnProfile(req.influencerId as string) });
    } catch (err) {
      next(err);
    }
  },
);

influencerPortalRouter.get(
  "/influencer-portal/campaigns",
  requireInfluencerAuth,
  async (req: InfluencerAuthedRequest, res, next) => {
    try {
      res.status(200).json(await service.getOwnCampaigns(req.influencerId as string));
    } catch (err) {
      next(err);
    }
  },
);

influencerPortalRouter.get(
  "/influencer-portal/acquisition-report",
  requireInfluencerAuth,
  async (req: InfluencerAuthedRequest, res, next) => {
    try {
      const query = getInfluencerAcquisitionReportQuerySchema.parse(req.query);
      res.status(200).json(await service.getOwnAcquisitionReport(req.influencerId as string, query));
    } catch (err) {
      next(err);
    }
  },
);

influencerPortalRouter.get(
  "/influencer-portal/payouts",
  requireInfluencerAuth,
  async (req: InfluencerAuthedRequest, res, next) => {
    try {
      res.status(200).json(await service.getOwnPayouts(req.influencerId as string));
    } catch (err) {
      next(err);
    }
  },
);
