import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminIntegrationsService from "./adminIntegrations.service";

export const adminIntegrationsRouter = Router();

// Folded into the doc's "Admin" permission scope, alongside Admin Users
// and Audit Logs — Integrations didn't exist yet when
// docs/admin/05-roles-permissions.md was written, but it's the same
// Module 12 Admin & System territory.
adminIntegrationsRouter.get(
  "/admin/integrations",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (_req, res, next) => {
    try {
      const result = await adminIntegrationsService.listIntegrations();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
