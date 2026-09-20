import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import {
  adminUpdateMaxActiveClientsSchema,
  listProfessionalsQuerySchema,
  suspendProfessionalSchema,
  verifyCredentialSchema,
  verifyKycSchema,
} from "./adminProfessionals.schema";
import * as adminProfessionalsService from "./adminProfessionals.service";

export const adminProfessionalsRouter = Router();

adminProfessionalsRouter.get(
  "/admin/professionals",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      const query = listProfessionalsQuerySchema.parse(req.query);
      const result = await adminProfessionalsService.listProfessionals(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminProfessionalsRouter.get(
  "/admin/professionals/:id",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      const result = await adminProfessionalsService.getProfessionalDetail(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminProfessionalsRouter.patch(
  "/admin/professionals/:id/credentials/:credentialId",
  requireAdminAuth,
  requirePermission("professionals", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = verifyCredentialSchema.parse(req.body);
      const credential = await adminProfessionalsService.verifyCredential(
        req.adminUserId as string,
        req.params.id,
        req.params.credentialId,
        input,
      );
      res.status(200).json({ credential });
    } catch (err) {
      next(err);
    }
  },
);

adminProfessionalsRouter.patch(
  "/admin/professionals/:id/kyc",
  requireAdminAuth,
  requirePermission("professionals", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = verifyKycSchema.parse(req.body);
      const professional = await adminProfessionalsService.verifyKyc(req.adminUserId as string, req.params.id, input);
      res.status(200).json({ professional });
    } catch (err) {
      next(err);
    }
  },
);

adminProfessionalsRouter.post(
  "/admin/professionals/:id/suspend",
  requireAdminAuth,
  requirePermission("professionals", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = suspendProfessionalSchema.parse(req.body ?? {});
      const professional = await adminProfessionalsService.suspendProfessional(
        req.adminUserId as string,
        req.params.id,
        input,
      );
      res.status(200).json({ professional });
    } catch (err) {
      next(err);
    }
  },
);

adminProfessionalsRouter.post(
  "/admin/professionals/:id/reactivate",
  requireAdminAuth,
  requirePermission("professionals", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const professional = await adminProfessionalsService.reactivateProfessional(req.adminUserId as string, req.params.id);
      res.status(200).json({ professional });
    } catch (err) {
      next(err);
    }
  },
);

// R2 Wave 1 (20 Sep 2026) — admin-editable capacity cap. See
// professionalLifecycle.service.ts's updateMaxActiveClients.
adminProfessionalsRouter.patch(
  "/admin/professionals/:id/capacity",
  requireAdminAuth,
  requirePermission("professionals", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = adminUpdateMaxActiveClientsSchema.parse(req.body);
      const professional = await adminProfessionalsService.updateMaxActiveClients(
        req.adminUserId as string,
        req.params.id,
        input,
      );
      res.status(200).json({ professional });
    } catch (err) {
      next(err);
    }
  },
);
