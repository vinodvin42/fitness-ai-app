import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { GymAuthedRequest, requireGymAuth } from "../../middleware/gymAuth";
import * as service from "./gyms.service";
import {
  addGymLocationSchema,
  createGymSchema,
  listGymsQuerySchema,
  setGymPortalPasswordSchema,
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

// Gym Partner Lite portal bootstrap (R2 Wave 5, 21 Sep 2026) — admin sets a
// Gym's portal login password. Same `gyms`/`edit` permission gate as
// locations/commercial terms above (a Gym Profile screen action, not a
// separate module). See gyms.service.ts#setGymPortalPassword's own doc
// comment for the onboarding-mechanism decision.
gymsRouter.post(
  "/admin/gyms/:id/portal-password",
  requireAdminAuth,
  requirePermission("gyms", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = setGymPortalPasswordSchema.parse(req.body);
      res.status(200).json(await service.setGymPortalPassword(req.adminUserId as string, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);

// ---- Gym-authed portal wrapper routes (R2 Wave 5, 21 Sep 2026) -----------
// apps/gym-portal's real backend surface — gated by requireGymAuth (never
// requireAdminAuth), and always scoped to req.gymId from the verified
// token, never a client-supplied `:id` — a gym can only ever read its own
// data. Both wrap the exact same Wave 1 service functions the admin routes
// above already use; neither's aggregation logic is duplicated here.
gymsRouter.get("/gym-portal/me", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    const gym = await service.getGymDetail(req.gymId as string);
    // Commercial terms (commissionPct/pricingModel/ratePerMemberCents) are
    // negotiated admin<->partner terms, not part of what the work package
    // asks this portal to show ("Organization and location profile ...
    // Pilot/commercial status summary" — a status summary, not the raw
    // negotiated figures) — trimmed here in the route, not in
    // getGymDetail() itself, so the admin-facing /admin/gyms/:id response
    // this same function backs is untouched.
    const { commissionPct: _commissionPct, pricingModel: _pricingModel, ratePerMemberCents: _ratePerMemberCents, ratePerMemberConfigured, ...portalGym } = gym;
    res.status(200).json({
      gym: { ...portalGym, commercialConfigured: ratePerMemberConfigured },
    });
  } catch (err) {
    next(err);
  }
});

gymsRouter.get("/gym-portal/member-activation-summary", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    res.status(200).json(await service.getMemberActivationSummary(req.gymId as string));
  } catch (err) {
    next(err);
  }
});
