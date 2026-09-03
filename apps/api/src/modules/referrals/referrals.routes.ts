import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import * as referralsService from "./referrals.service";

export const referralsRouter = Router();

referralsRouter.get("/referrals/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await referralsService.getMyReferralSummary(req.userId!));
  } catch (err) {
    next(err);
  }
});
