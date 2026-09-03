import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import {
  createSensitiveAccessRequestSchema,
  listUsersQuerySchema,
  reviewSensitiveAccessRequestSchema,
  suspendUserSchema,
} from "./adminUsers.schema";
import * as adminUsersService from "./adminUsers.service";

export const adminUsersRouter = Router();

adminUsersRouter.get(
  "/admin/users",
  requireAdminAuth,
  requirePermission("users", "view"),
  async (req, res, next) => {
    try {
      const query = listUsersQuerySchema.parse(req.query);
      const result = await adminUsersService.listUsers(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminUsersRouter.get(
  "/admin/users/:id",
  requireAdminAuth,
  requirePermission("users", "view"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const result = await adminUsersService.getUserDetail(req.params.id, req.adminUserId as string, req.adminRole);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Sensitive Data Access Requests (02.02's locked panel), added 25 Aug
// 2026. Gated by the `sensitiveData` module, not `users` — holding
// `users: view` is enough to see a profile at all, but requesting/
// reviewing access to the sensitive panel is its own permission scope
// per docs/admin/05-roles-permissions.md §4 — see adminUsers.service.ts's
// top comment and SensitiveDataAccessRequest's own doc comment.
adminUsersRouter.post(
  "/admin/users/:id/sensitive-access-requests",
  requireAdminAuth,
  requirePermission("sensitiveData", "view"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createSensitiveAccessRequestSchema.parse(req.body);
      const result = await adminUsersService.createSensitiveAccessRequest(req.adminUserId as string, req.params.id, input);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminUsersRouter.post(
  "/admin/sensitive-access-requests/:id/approve",
  requireAdminAuth,
  requirePermission("sensitiveData", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = reviewSensitiveAccessRequestSchema.parse(req.body);
      const result = await adminUsersService.approveSensitiveAccessRequest(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminUsersRouter.post(
  "/admin/sensitive-access-requests/:id/deny",
  requireAdminAuth,
  requirePermission("sensitiveData", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = reviewSensitiveAccessRequestSchema.parse(req.body);
      const result = await adminUsersService.denySensitiveAccessRequest(req.adminUserId as string, req.params.id, input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Module 02.01 Bulk-select + suspend/reactivate, added 26 Aug 2026 —
// same `requirePermission("users", "edit")` gate and route shape as
// adminProfessionals.routes.ts's suspend/reactivate.
adminUsersRouter.post(
  "/admin/users/:id/suspend",
  requireAdminAuth,
  requirePermission("users", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = suspendUserSchema.parse(req.body ?? {});
      const user = await adminUsersService.suspendUser(req.adminUserId as string, req.params.id, input);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

adminUsersRouter.post(
  "/admin/users/:id/reactivate",
  requireAdminAuth,
  requirePermission("users", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const user = await adminUsersService.reactivateUser(req.adminUserId as string, req.params.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);
