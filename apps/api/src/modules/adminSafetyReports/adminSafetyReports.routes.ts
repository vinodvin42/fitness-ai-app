import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listSafetyReportsQuerySchema, resolveSafetyReportSchema } from "./adminSafetyReports.schema";
import * as adminSafetyReportsService from "./adminSafetyReports.service";

// 08.04 Safety & Abuse Reports (Oct 2026), under the existing "support"
// scope with the rest of Support & Safety. See the service comment.
export const adminSafetyReportsRouter = Router();

adminSafetyReportsRouter.get(
  "/admin/safety-reports",
  requireAdminAuth,
  requirePermission("support", "view"),
  async (req, res, next) => {
    try {
      const query = listSafetyReportsQuerySchema.parse(req.query);
      res.status(200).json(await adminSafetyReportsService.listSafetyReports(query));
    } catch (err) {
      next(err);
    }
  },
);

adminSafetyReportsRouter.get(
  "/admin/safety-reports/:id",
  requireAdminAuth,
  requirePermission("support", "view"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      res.status(200).json(await adminSafetyReportsService.getSafetyReport(req.adminUserId as string, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

adminSafetyReportsRouter.post(
  "/admin/safety-reports/:id/resolve",
  requireAdminAuth,
  requirePermission("support", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = resolveSafetyReportSchema.parse(req.body);
      res.status(200).json(await adminSafetyReportsService.resolveSafetyReport(req.adminUserId as string, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
