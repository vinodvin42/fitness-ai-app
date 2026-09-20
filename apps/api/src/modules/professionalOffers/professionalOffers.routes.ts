import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import {
  createOfferSchema,
  declineOfferSchema,
  listAvailableProfessionalsQuerySchema,
  listOffersForProfessionalQuerySchema,
  listOffersQuerySchema,
} from "./professionalOffers.schema";
import * as professionalOffersService from "./professionalOffers.service";

/**
 * Professional Offers (R2 Wave 2, 20 Sep 2026) — see
 * professionalOffers.service.ts's own doc comment for the full "why this
 * module exists" reasoning.
 */
export const professionalOffersRouter = Router();

// ---- admin-web (admin-authed) -------------------------------------------

// Deliberately NOT "/admin/professionals/available" — adminProfessionals
// .routes.ts's own "/admin/professionals/:id" is registered (in app.ts)
// before this router, and Express matches routers in mount order: a
// "/admin/professionals/available" request would be swallowed as that
// route's `:id` param (`professionalId: "available"` -> a real 404) before
// ever reaching this router. Nested under this module's own
// "/admin/professional-offers" prefix instead — no collision, and it reads
// naturally as "the professionals list this Propose Professional flow
// needs" rather than a sibling of adminProfessionalsRouter's own Directory.
professionalOffersRouter.get(
  "/admin/professional-offers/available-professionals",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      const query = listAvailableProfessionalsQuerySchema.parse(req.query);
      res.status(200).json(await professionalOffersService.listAvailableProfessionals(query));
    } catch (err) {
      next(err);
    }
  },
);

professionalOffersRouter.get(
  "/admin/professional-offers",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      const query = listOffersQuerySchema.parse(req.query);
      res.status(200).json(await professionalOffersService.listOffers(query));
    } catch (err) {
      next(err);
    }
  },
);

professionalOffersRouter.post(
  "/admin/professional-offers",
  requireAdminAuth,
  requirePermission("professionals", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createOfferSchema.parse(req.body);
      const offer = await professionalOffersService.createOffer(req.adminUserId as string, input);
      res.status(201).json({ offer });
    } catch (err) {
      next(err);
    }
  },
);

// ---- coach-mobile (professional-authed) ----------------------------------

// R1 U6, Wave 3 (20 Sep 2026) — the replacement-professional picker for the
// real Handover action (relationshipLifecycle.service.ts). Reuses this
// module's own `listAvailableProfessionals` (the exact function admin-web's
// Propose Professional dropdown already uses) rather than a second "pick a
// professional" implementation, with the one real addition that picker
// needs: excluding the calling coach's own id, so a coach can't propose
// themselves as their own replacement.
professionalOffersRouter.get(
  "/professionals/me/available-professionals",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const query = listAvailableProfessionalsQuerySchema.parse(req.query);
      res.json(await professionalOffersService.listAvailableProfessionals(query, req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

professionalOffersRouter.get(
  "/professionals/me/offers",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const query = listOffersForProfessionalQuerySchema.parse(req.query);
      res.json(await professionalOffersService.listOffersForProfessional(req.professionalId as string, query));
    } catch (err) {
      next(err);
    }
  },
);

professionalOffersRouter.post(
  "/professionals/me/offers/:id/accept",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await professionalOffersService.acceptOffer(req.professionalId as string, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

professionalOffersRouter.post(
  "/professionals/me/offers/:id/decline",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = declineOfferSchema.parse(req.body ?? {});
      res.json(await professionalOffersService.declineOffer(req.professionalId as string, req.params.id, input.reason));
    } catch (err) {
      next(err);
    }
  },
);
