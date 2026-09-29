import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./guidanceRequests.service";
import * as offersService from "../professionalOffers/professionalOffers.service";

export const guidanceRequestsRouter = Router();

const createSchema = z.object({
  serviceType: z.enum(["fitness", "nutrition"]),
  userNote: z.string().trim().max(1000).optional(),
});

const matchSchema = z.object({
  professionalId: z.string().uuid(),
});

/**
 * Handoff §2 decision #4 — "Request professional guidance", the only
 * route into a professional relationship when the marketplace is off.
 * Journey F5's missing link and A-M1's queue, both ends.
 */

// ---- Consumer (U-M5) ------------------------------------------------

guidanceRequestsRouter.post("/coaching/guidance-requests", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    res.status(201).json(await service.createGuidanceRequest(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

guidanceRequestsRouter.get("/coaching/guidance-requests", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.listMyGuidanceRequests(req.userId!));
  } catch (err) {
    next(err);
  }
});

guidanceRequestsRouter.post(
  "/coaching/guidance-requests/:id/cancel",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      res.json(await service.cancelMyGuidanceRequest(req.userId!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ---- Admin assignment queue (A-M1) ----------------------------------

guidanceRequestsRouter.get(
  "/admin/guidance-requests",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json(await service.listOpenGuidanceRequests(status));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * The match action: pick a professional for an open request and send the
 * offer in one step. Deliberately one endpoint rather than "create offer"
 * plus "link it to the request" — two calls means a request that is
 * marked offered with no offer behind it, or an offer nothing points at,
 * whenever the second call fails.
 */
guidanceRequestsRouter.post(
  "/admin/guidance-requests/:id/match",
  requireAdminAuth,
  requirePermission("professionals", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = matchSchema.parse(req.body);
      const request = await service.getGuidanceRequestForMatch(req.params.id);

      const offer = await offersService.createOffer(req.adminUserId as string, {
        userId: request.userId,
        professionalId: input.professionalId,
        serviceType: request.serviceType as "fitness" | "nutrition",
      });

      const updated = await service.markOffered(req.params.id, offer.id, req.adminUserId as string);
      res.status(201).json({ offer, request: updated });
    } catch (err) {
      next(err);
    }
  },
);
