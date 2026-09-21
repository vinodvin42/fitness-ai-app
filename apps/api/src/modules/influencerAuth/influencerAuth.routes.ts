import { Router } from "express";
import { influencerLoginSchema, influencerRefreshSchema } from "./influencerAuth.schema";
import * as influencerAuthService from "./influencerAuth.service";
import { requireInfluencerAuth, InfluencerAuthedRequest } from "../../middleware/influencerAuth";
import { authRateLimit } from "../../middleware/rateLimit";

/**
 * Creator Portal auth (R2 Wave 5, 21 Sep 2026) — mirrors
 * professionalAuth.routes.ts, minus signup (see influencerAuth.schema.ts's
 * doc comment for why: an Influencer always starts as an admin-entered
 * record, portal access is admin-granted, not self-registered).
 */
export const influencerAuthRouter = Router();

influencerAuthRouter.post("/influencers/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const input = influencerLoginSchema.parse(req.body);
    const { influencer, tokens } = await influencerAuthService.influencerLogin(input);
    res.status(200).json({
      influencer: influencerAuthService.toPublicInfluencer(influencer),
      tokens,
    });
  } catch (err) {
    next(err);
  }
});

influencerAuthRouter.post("/influencers/auth/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = influencerRefreshSchema.parse(req.body);
    const { influencer, tokens } = await influencerAuthService.influencerRefresh(refreshToken);
    res.status(200).json({ influencer: influencerAuthService.toPublicInfluencer(influencer), tokens });
  } catch (err) {
    next(err);
  }
});

influencerAuthRouter.post("/influencers/auth/logout", async (req, res, next) => {
  try {
    const { refreshToken } = influencerRefreshSchema.parse(req.body);
    await influencerAuthService.influencerLogout(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Mirrors GET /professionals/me — used by apps/creator-portal's
// AuthContext to resolve "who am I" on launch when a token is already
// stored.
influencerAuthRouter.get(
  "/influencers/me",
  requireInfluencerAuth,
  async (req: InfluencerAuthedRequest, res, next) => {
    try {
      const influencer = await influencerAuthService.getInfluencerById(req.influencerId as string);
      res.status(200).json({ influencer: influencerAuthService.toPublicInfluencer(influencer) });
    } catch (err) {
      next(err);
    }
  },
);
