import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listAuditLogsQuerySchema } from "./adminAuditLogs.schema";
import * as adminAuditLogsService from "./adminAuditLogs.service";

export const adminAuditLogsRouter = Router();

adminAuditLogsRouter.get(
  "/admin/audit-logs",
  requireAdminAuth,
  requirePermission("auditLogs", "view"),
  async (req, res, next) => {
    try {
      const query = listAuditLogsQuerySchema.parse(req.query);
      const result = await adminAuditLogsService.listAuditLogs(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
