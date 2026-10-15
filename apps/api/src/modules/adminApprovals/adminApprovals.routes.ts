import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { hasPermission } from "../../middleware/adminPermissions";
import { ApiHttpError } from "../../middleware/errorHandler";
import { decideApprovalSchema, listApprovalsQuerySchema, requestChangesSchema } from "./adminApprovals.schema";
import * as service from "./adminApprovals.service";

/**
 * Approvals inbox (D21). These routes deliberately do NOT use
 * requirePermission's write path: deciding a request is itself the
 * checker step, so it must never be turned into another approval request.
 * Who may decide is checked in the service (Super Admin only).
 */
export const adminApprovalsRouter = Router();

function viewer(req: AdminAuthedRequest) {
  return { adminId: req.adminUserId as string, role: req.adminRole };
}

function requireApprovalsView(req: AdminAuthedRequest) {
  if (!hasPermission(req.adminRole, "approvals", "view")) {
    throw new ApiHttpError(403, "forbidden", "Your role cannot see approval requests");
  }
}

adminApprovalsRouter.get("/admin/approvals", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    requireApprovalsView(req);
    const query = listApprovalsQuerySchema.parse(req.query);
    res.json(await service.listApprovals(viewer(req), query));
  } catch (err) {
    next(err);
  }
});

adminApprovalsRouter.get("/admin/approvals/:id", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    requireApprovalsView(req);
    res.json(await service.getApproval(viewer(req), req.params.id));
  } catch (err) {
    next(err);
  }
});

adminApprovalsRouter.post("/admin/approvals/:id/approve", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = decideApprovalSchema.parse(req.body ?? {});
    res.json(await service.approve(viewer(req), req.params.id, input.note ?? null));
  } catch (err) {
    next(err);
  }
});

adminApprovalsRouter.post("/admin/approvals/:id/reject", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = decideApprovalSchema.parse(req.body ?? {});
    res.json(await service.reject(viewer(req), req.params.id, input.note ?? null));
  } catch (err) {
    next(err);
  }
});

adminApprovalsRouter.post("/admin/approvals/:id/request-changes", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    const input = requestChangesSchema.parse(req.body ?? {});
    res.json(await service.requestChanges(viewer(req), req.params.id, input.note));
  } catch (err) {
    next(err);
  }
});

adminApprovalsRouter.post("/admin/approvals/:id/cancel", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    res.json(await service.cancel(viewer(req), req.params.id));
  } catch (err) {
    next(err);
  }
});
