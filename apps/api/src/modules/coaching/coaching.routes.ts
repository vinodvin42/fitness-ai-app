import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import {
  availabilityQuerySchema,
  createBookingSchema,
  createChangeRequestSchema,
  discoverProfessionalsQuerySchema,
} from "./coaching.schema";
import * as coachingService from "./coaching.service";

export const coachingRouter = Router();

// Professional-authed, not consumer-authed — this is the coach's OWN
// schedule, added 26 Aug 2026 to back apps/coach-mobile's real Calendar
// tab. Lives in this module (not professionalDashboard) because the
// domain logic — Booking queries — belongs with the rest of this file's
// Booking-owning code; only the auth guard differs per route, same
// "one module, mixed auth per route" precedent as adminPrograms' both
// admin-write and consumer-read endpoints.
coachingRouter.get(
  "/professionals/me/schedule",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await coachingService.listMySchedule(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

coachingRouter.get("/coaching/professionals", requireAuth, async (req, res, next) => {
  try {
    const query = discoverProfessionalsQuerySchema.parse(req.query);
    res.json(await coachingService.listProfessionals(query));
  } catch (err) {
    next(err);
  }
});

// "My Professional Team" — mounted before the :id detail route below so
// "team" is never swallowed as a professional id, same ordering caveat
// app.ts's own comment calls out for programPurchasesRouter/programsRouter.
coachingRouter.get("/coaching/team", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await coachingService.listMyTeam(req.userId!));
  } catch (err) {
    next(err);
  }
});

coachingRouter.get("/coaching/professionals/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await coachingService.getProfessionalDetail(req.params.id));
  } catch (err) {
    next(err);
  }
});

coachingRouter.get("/coaching/professionals/:id/availability", requireAuth, async (req, res, next) => {
  try {
    const query = availabilityQuerySchema.parse(req.query);
    res.json(await coachingService.getAvailability(req.params.id, query));
  } catch (err) {
    next(err);
  }
});

coachingRouter.post("/coaching/bookings", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createBookingSchema.parse(req.body);
    res.status(201).json(await coachingService.createBooking(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

coachingRouter.post(
  "/coaching/relationships/:id/change-request",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = createChangeRequestSchema.parse(req.body);
      res.status(201).json(await coachingService.createChangeRequest(req.userId!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
