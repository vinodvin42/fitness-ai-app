import { Router } from "express";
import { z } from "zod";
import { requireGymAuth, GymAuthedRequest } from "../../middleware/gymAuth";
import * as service from "./gymPortal.service";

export const gymPortalRouter = Router();

/**
 * Gym Partner Lite's own surface (G-M2 to G-M5). Every route is gated by
 * requireGymAuth and scoped to `req.gymId` from the verified token —
 * never a client-supplied id — so a gym can only ever reach its own
 * rows. Nothing here returns a member list or any member-level field
 * (BR-GYM-003).
 */

const equipmentSchema = z.object({ equipment: z.string().trim().min(1).max(4000) });

const helpRequestSchema = z.object({
  category: z.enum(["trainer_support", "equipment", "member_onboarding", "billing", "other"]),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(4000),
  locationId: z.string().uuid().optional(),
  gymReference: z.string().trim().max(200).optional(),
});

gymPortalRouter.get("/gym-portal/locations", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    res.json(await service.listLocations(req.gymId as string));
  } catch (err) {
    next(err);
  }
});

gymPortalRouter.patch(
  "/gym-portal/locations/:id/equipment",
  requireGymAuth,
  async (req: GymAuthedRequest, res, next) => {
    try {
      const input = equipmentSchema.parse(req.body);
      res.json(await service.updateEquipment(req.gymId as string, req.params.id, input.equipment));
    } catch (err) {
      next(err);
    }
  },
);

// Distinct from the PATCH above on purpose: a gym whose kit hasn't
// changed should be able to say so without retyping it, or they will
// learn to paste anything to clear the warning.
gymPortalRouter.post(
  "/gym-portal/locations/:id/equipment/reconfirm",
  requireGymAuth,
  async (req: GymAuthedRequest, res, next) => {
    try {
      res.json(await service.reconfirmEquipment(req.gymId as string, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

gymPortalRouter.get("/gym-portal/invite", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    res.json(await service.getInviteAssets(req.gymId as string));
  } catch (err) {
    next(err);
  }
});

gymPortalRouter.get("/gym-portal/partnership", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    res.json(await service.getPartnership(req.gymId as string));
  } catch (err) {
    next(err);
  }
});

gymPortalRouter.get("/gym-portal/help-requests", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    res.json(await service.listHelpRequests(req.gymId as string));
  } catch (err) {
    next(err);
  }
});

gymPortalRouter.get("/gym-portal/help-requests/:id", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    res.json(await service.getHelpRequest(req.gymId as string, req.params.id));
  } catch (err) {
    next(err);
  }
});

gymPortalRouter.post("/gym-portal/help-requests", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    const input = helpRequestSchema.parse(req.body);
    res.status(201).json(await service.createHelpRequest(req.gymId as string, input));
  } catch (err) {
    next(err);
  }
});
