import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { createAdminUserSchema, listAdminUsersQuerySchema } from "./adminAccounts.schema";
import * as adminAccountsService from "./adminAccounts.service";

export const adminAccountsRouter = Router();

// Admin Users management maps to the doc's "Admin" permission scope, not
// "Users" (that's the consumer-facing adminUsers module) — see
// adminPermissions.ts's own doc comment.
adminAccountsRouter.get(
  "/admin/admin-users",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (req, res, next) => {
    try {
      const query = listAdminUsersQuerySchema.parse(req.query);
      const result = await adminAccountsService.listAdminUsers(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminAccountsRouter.post(
  "/admin/admin-users",
  requireAdminAuth,
  requirePermission("admin", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createAdminUserSchema.parse(req.body);
      const result = await adminAccountsService.createAdminUser(req.adminUserId as string, input);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminAccountsRouter.post(
  "/admin/admin-users/:id/disable",
  requireAdminAuth,
  requirePermission("admin", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminUser = await adminAccountsService.disableAdminUser(req.adminUserId as string, req.params.id);
      res.status(200).json({ adminUser });
    } catch (err) {
      next(err);
    }
  },
);

adminAccountsRouter.post(
  "/admin/admin-users/:id/enable",
  requireAdminAuth,
  requirePermission("admin", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const adminUser = await adminAccountsService.enableAdminUser(req.adminUserId as string, req.params.id);
      res.status(200).json({ adminUser });
    } catch (err) {
      next(err);
    }
  },
);
