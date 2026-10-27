import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import * as service from "./bookingChanges.service";
import { availabilityQuerySchema } from "../coaching/coaching.schema";
import { getAvailability } from "../coaching/coaching.service";

/** Booking changes (27 Oct 2026): cancel for a credit, coach-proposed times, booking with a credit. See the service. */
export const bookingChangesRouter = Router();

const proposeSchema = z.object({ scheduledAt: z.string().datetime() });
const bookWithCreditSchema = z.object({
  professionalId: z.string().uuid(),
  offeringId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  creditId: z.string().uuid(),
});

bookingChangesRouter.post("/coaching/bookings/:id/cancel", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.cancelBookingAsMember(req.userId!, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

bookingChangesRouter.post("/coaching/bookings/:id/proposal/accept", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.acceptProposal(req.userId!, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

bookingChangesRouter.post("/coaching/bookings/:id/proposal/decline", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.declineProposal(req.userId!, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

bookingChangesRouter.get("/coaching/credits", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.listMyCredits(req.userId!));
  } catch (err) {
    next(err);
  }
});

bookingChangesRouter.post("/coaching/bookings/with-credit", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = bookWithCreditSchema.parse(req.body);
    res.status(201).json(await service.bookWithCredit(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

bookingChangesRouter.post(
  "/professionals/me/bookings/:id/propose-time",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = proposeSchema.parse(req.body);
      res.json(await service.proposeNewTime(req.professionalId as string, String(req.params.id), input));
    } catch (err) {
      next(err);
    }
  },
);

// The coach's own free slots for a day, the same grid members book from, for picking a new time.
bookingChangesRouter.get("/professionals/me/availability", requireProfessionalAuth, async (req: ProfessionalAuthedRequest, res, next) => {
  try {
    const query = availabilityQuerySchema.parse(req.query);
    res.json(await getAvailability(req.professionalId as string, query));
  } catch (err) {
    next(err);
  }
});

bookingChangesRouter.post(
  "/professionals/me/bookings/:id/withdraw-proposal",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await service.withdrawProposal(req.professionalId as string, String(req.params.id)));
    } catch (err) {
      next(err);
    }
  },
);
