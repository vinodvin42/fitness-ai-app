import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./gyms.service";
import {
  addGymLocationSchema,
  createGymSchema,
  listGymsQuerySchema,
  updateGymCommercialSchema,
  updateGymStatusSchema,
} from "./gyms.schema";

/**
 * Gym Partner Lite — R1 Wave 1 (added 20 Sep 2026). A minimal, honest route
 * surface over gyms.service.ts purely so this wave's persistence is
 * verifiable over real HTTP — NOT an admin-web screen (Wave 4's own
 * scope) and NOT the gym-facing portal (Wave 5's own scope). Gated on the
 * new `gyms` permission module, same requireAdminAuth/requirePermission
 * convention as every other admin module.
 */
export const gymsRouter = Router();

gymsRouter.get(
  "/admin/gyms",
  requireAdminAuth,
  requirePermission("gyms", "view"),
  async (req, res, next) => {
    try {
      const query = listGymsQuerySchema.parse(req.query);
      res.status(200).json(await service.listGyms(query));
    } catch (err) {
      next(err);
    }
  },
);

gymsRouter.get(
  "/admin/gyms/:id",
  requireAdminAuth,
  requirePermission("gyms", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json({ gym: await service.getGymDetail(req.params.id) });
    } catch (err) {
      next(err);
    }
  },
);

gymsRouter.get(
  "/admin/gyms/:id/member-activation-summary",
  requireAdminAuth,
  requirePermission("gyms", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json(await service.getMemberActivationSummary(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

gymsRouter.post(
  "/admin/gyms",
  requireAdminAuth,
  requirePermission("gyms", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createGymSchema.parse(req.body);
      res.status(201).json({ gym: await service.createGym(req.adminUserId as string, input) });
    } catch (err) {
      next(err);
    }
  },
);

gymsRouter.post(
  "/admin/gyms/:id/locations",
  requireAdminAuth,
  requirePermission("gyms", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = addGymLocationSchema.parse(req.body);
      res.status(201).json({ location: await service.addGymLocation(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

gymsRouter.patch(
  "/admin/gyms/:id/status",
  requireAdminAuth,
  requirePermission("gyms", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateGymStatusSchema.parse(req.body);
      res.status(200).json({ gym: await service.updateGymStatus(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);

gymsRouter.patch(
  "/admin/gyms/:id/commercial",
  requireAdminAuth,
  requirePermission("gyms", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateGymCommercialSchema.parse(req.body);
      res.status(200).json({ gym: await service.updateGymCommercial(req.adminUserId as string, req.params.id, input) });
    } catch (err) {
      next(err);
    }
  },
);
