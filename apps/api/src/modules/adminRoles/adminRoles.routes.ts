import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { ApiHttpError } from "../../middleware/errorHandler";
import * as adminRolesService from "./adminRoles.service";

export const adminRolesRouter = Router();

// 12.02 Roles & Permissions — read-only, gated by the "admin" module scope
// same as every other Module 12 sub-screen not given its own permission
// row (12.01, 12.06). See adminRoles.service.ts's top comment.
adminRolesRouter.get(
  "/admin/roles",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (_req, res, next) => {
    try {
      const result = await adminRolesService.listRoles();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminRolesRouter.get(
  "/admin/roles/:role",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (req, res, next) => {
    try {
      const result = await adminRolesService.getRoleDetail(req.params.role);
      if (!result) {
        throw new ApiHttpError(404, "not_found", "Unknown role");
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
