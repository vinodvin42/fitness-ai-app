import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { publishSummarySchema } from "./coachSummaries.schema";
import * as coachSummariesService from "./coachSummaries.service";

/** Mixed auth per route: User Bearer for /coaching/*, Professional Bearer for /professionals/me/*. */
export const coachSummariesRouter = Router();

coachSummariesRouter.get("/coaching/bookings", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await coachSummariesService.listMyBookings(req.userId!));
  } catch (err) {
    next(err);
  }
});

coachSummariesRouter.get("/coaching/bookings/:id/summary", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await coachSummariesService.getBookingSummary(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

coachSummariesRouter.post(
  "/professionals/me/bookings/:id/summary",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = publishSummarySchema.parse(req.body);
      res.json(
        await coachSummariesService.publishBookingSummary(req.professionalId as string, req.params.id, input.summaryText),
      );
    } catch (err) {
      next(err);
    }
  },
);
