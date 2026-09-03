import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listAdminReferralsQuerySchema } from "./adminReferrals.schema";
import * as adminReferralsService from "./adminReferrals.service";

export const adminReferralsRouter = Router();

// Referrals maps to the doc's "Growth" permission scope ("Influencers,
// referrals, campaigns") — see adminPermissions.ts's own doc comment.
adminReferralsRouter.get(
  "/admin/referrals",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (req, res, next) => {
    try {
      const query = listAdminReferralsQuerySchema.parse(req.query);
      const result = await adminReferralsService.listReferrals(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
