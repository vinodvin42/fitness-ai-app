import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import {
  highImpactSubscriptionSchema,
  revokeSubscriptionSchema,
  unrevokeSubscriptionSchema,
} from "./adminSubscriptions.schema";
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

/**
 * Gap §57 follow-up (22 Sep 2026) — real admin un-revoke, reversing a
 * mistaken or since-resolved force-revoke. Same `commerce: approve` gate
 * as the revoke route above (see subscriptions.service.ts's
 * `unrevokeSubscription` for the full status-restoration reasoning and
 * atomic claim-once discipline).
 */
adminSubscriptionsRouter.post(
  "/admin/subscriptions/:id/unrevoke",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = unrevokeSubscriptionSchema.parse(req.body);
      const subscription = await subscriptionsService.unrevokeSubscription(
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

/**
 * U-M4 — suspend and reactivate, §10's reversible ACTIVE <-> SUSPENDED
 * pair. Deliberately separate from revoke/un-revoke above: revoke is
 * terminal and un-revoke undoes a mistake, whereas suspension is a hold
 * an admin expects to lift. Collapsing them would force an admin
 * investigating a chargeback to use the irreversible action.
 *
 * Both are high-impact under BR-ADM-005 (they remove or restore access
 * someone paid for), so both take a written reason and a typed
 * confirmation, enforced in the service.
 */
adminSubscriptionsRouter.post(
  "/admin/subscriptions/:id/suspend",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = highImpactSubscriptionSchema.parse(req.body);
      const subscription = await subscriptionsService.suspendSubscription(
        req.adminUserId as string,
        req.params.id,
        input,
      );
      res.status(200).json({ subscription });
    } catch (err) {
      next(err);
    }
  },
);

adminSubscriptionsRouter.post(
  "/admin/subscriptions/:id/reactivate",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = highImpactSubscriptionSchema.parse(req.body);
      const subscription = await subscriptionsService.reactivateSubscription(
        req.adminUserId as string,
        req.params.id,
        input,
      );
      res.status(200).json({ subscription });
    } catch (err) {
      next(err);
    }
  },
);
