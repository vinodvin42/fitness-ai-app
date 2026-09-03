import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminPrivacyService from "./adminPrivacy.service";

export const adminPrivacyRouter = Router();

// 12.04 Privacy & Data Governance — gated by "sensitiveData: view", same
// permission the underlying SensitiveDataAccessRequest rows are already
// gated by on Module 02's Profile screen (only super_admin holds it in
// the current PERMISSION_MATRIX). See adminPrivacy.service.ts's top
// comment for what this endpoint does and doesn't represent.
adminPrivacyRouter.get(
  "/admin/privacy",
  requireAdminAuth,
  requirePermission("sensitiveData", "view"),
  async (_req, res, next) => {
    try {
      const result = await adminPrivacyService.getPrivacyDashboard();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
