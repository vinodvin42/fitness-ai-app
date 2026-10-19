import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminPlatformSettingsService from "./adminPlatformSettings.service";

// 12.08 Platform Settings (Oct 2026) — read-only, under the existing
// "admin" scope like the rest of Admin & System. See the service comment.
export const adminPlatformSettingsRouter = Router();

adminPlatformSettingsRouter.get(
  "/admin/platform-settings",
  requireAdminAuth,
  requirePermission("admin", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await adminPlatformSettingsService.getPlatformSettings());
    } catch (err) {
      next(err);
    }
  },
);
