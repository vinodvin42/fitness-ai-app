import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import {
  endRelationshipSchema,
  listChangeRequestsQuerySchema,
  listRelationshipsQuerySchema,
  reviewChangeRequestSchema,
} from "./adminRelationships.schema";
import { handoverRelationshipSchema } from "../relationshipLifecycle/relationshipLifecycle.schema";
import { completeRelationship } from "../relationshipLifecycle/relationshipLifecycle.service";
import * as adminRelationshipsService from "./adminRelationships.service";

export const adminRelationshipsRouter = Router();

adminRelationshipsRouter.get(
  "/admin/relationships",
  requireAdminAuth,
  requirePermission("relationships", "view"),
  async (req, res, next) => {
    try {
      const query = listRelationshipsQuerySchema.parse(req.query);
      const result = await adminRelationshipsService.listRelationships(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// 04.03 Change/Intervention Queue (added 25 Aug 2026) — registered BEFORE
// "/admin/relationships/:id" below: Express matches GET routes in
// registration order, not by specificity like React Router, so
// "change-requests" would otherwise be captured as the `:id` param.
adminRelationshipsRouter.get(
  "/admin/relationships/change-requests",
  requireAdminAuth,
  requirePermission("relationships", "view"),
  async (req, res, next) => {
    try {
      const query = listChangeRequestsQuerySchema.parse(req.query);
      const result = await adminRelationshipsService.listChangeRequests(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminRelationshipsRouter.post(
  "/admin/relationships/change-requests/:id/approve",
  requireAdminAuth,
  requirePermission("relationships", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = reviewChangeRequestSchema.parse(req.body ?? {});
      const result = await adminRelationshipsService.approveChangeRequest(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminRelationshipsRouter.post(
  "/admin/relationships/change-requests/:id/deny",
  requireAdminAuth,
  requirePermission("relationships", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = reviewChangeRequestSchema.parse(req.body ?? {});
      const result = await adminRelationshipsService.denyChangeRequest(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminRelationshipsRouter.get(
  "/admin/relationships/:id",
  requireAdminAuth,
  requirePermission("relationships", "view"),
  async (req, res, next) => {
    try {
      const result = await adminRelationshipsService.getRelationshipDetail(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminRelationshipsRouter.post(
  "/admin/relationships/:id/end",
  requireAdminAuth,
  requirePermission("relationships", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = endRelationshipSchema.parse(req.body ?? {});
      const relationship = await adminRelationshipsService.endRelationship(req.adminUserId as string, req.params.id, input);
      res.status(200).json({ relationship });
    } catch (err) {
      next(err);
    }
  },
);

// P-M11 / U-M8 — "Complete programme". §10 makes COMPLETED a distinct
// terminal state from ENDED: ending says the arrangement stopped,
// completing says the work finished, and the user's completion summary
// and the professional's own record are about the latter.
adminRelationshipsRouter.post(
  "/admin/relationships/:id/complete",
  requireAdminAuth,
  requirePermission("relationships", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = endRelationshipSchema.parse(req.body ?? {});
      const relationship = await completeRelationship(
        { adminId: req.adminUserId as string },
        req.params.id,
        input.reason,
      );
      res.status(200).json({ relationship });
    } catch (err) {
      next(err);
    }
  },
);

// R1 U6, Wave 3 (20 Sep 2026) — the admin-initiated real "Handover to
// Another Coach" action. See relationshipLifecycle.service.ts's own doc
// comment for why this composes the same endRelationship + createOffer as
// the coach-mobile professional-initiated version rather than a second
// implementation.
adminRelationshipsRouter.post(
  "/admin/relationships/:id/handover",
  requireAdminAuth,
  requirePermission("relationships", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = handoverRelationshipSchema.parse(req.body ?? {});
      const result = await adminRelationshipsService.handoverRelationship(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminRelationshipsRouter.post(
  "/admin/relationships/:id/reactivate",
  requireAdminAuth,
  requirePermission("relationships", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const relationship = await adminRelationshipsService.reactivateRelationship(req.adminUserId as string, req.params.id);
      res.status(200).json({ relationship });
    } catch (err) {
      next(err);
    }
  },
);
