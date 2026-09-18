import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listSafetyEscalationsQuerySchema, reviewSafetyEscalationSchema } from "./adminSafety.schema";
import * as adminSafetyService from "./adminSafety.service";

export const adminSafetyRouter = Router();

// BR-SAF-004 Safety Escalations (added 18 Sep 2026) — see
// adminSafety.service.ts's top comment for the full design. Gated by the
// same `support` module Module 08's other real queue (08.02 Escalations)
// uses — this is that module's second real screen, not a new permission
// scope.

adminSafetyRouter.get(
  "/admin/safety-escalations",
  requireAdminAuth,
  requirePermission("support", "view"),
  async (req, res, next) => {
    try {
      const query = listSafetyEscalationsQuerySchema.parse(req.query);
      const result = await adminSafetyService.listSafetyEscalations(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminSafetyRouter.post(
  "/admin/safety-escalations/:id/review",
  requireAdminAuth,
  requirePermission("support", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      reviewSafetyEscalationSchema.parse(req.body ?? {});
      const escalation = await adminSafetyService.reviewSafetyEscalation(req.adminUserId as string, req.params.id);
      res.status(200).json({ escalation });
    } catch (err) {
      next(err);
    }
  },
);
