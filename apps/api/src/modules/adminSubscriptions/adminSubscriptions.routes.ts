import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { revokeSubscriptionSchema } from "./adminSubscriptions.schema";
import * as subscriptionsService from "../subscriptions/subscriptions.service";

export const adminSubscriptionsRouter = Router();

/**
 * Gap §57 (18 Sep 2026) — real admin force-revoke, the R1 work package's
 * `revoked` state. Gated on `commerce: approve` (not `edit`) — the
 * strongest action this module's permission scope has, matching the fact
 * that this is a sensitive, irreversible, money-adjacent action (fraud/
 * chargeback/ToS) rather than an ordinary edit. Today only `super_admin`
 * and `finance` hold `commerce: approve` (see adminPermissions.ts's
 * PERMISSION_MATRIX) — every other role correctly 403s.
 */
adminSubscriptionsRouter.post(
  "/admin/subscriptions/:id/revoke",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = revokeSubscriptionSchema.parse(req.body);
      const subscription = await subscriptionsService.revokeSubscription(
        req.adminUserId as string,
        req.params.id,
        input.reason,
      );
      res.status(200).json({ subscription });
    } catch (err) {
      next(err);
    }
  },
);
