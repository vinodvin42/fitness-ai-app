import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { trackEvent } from "../../lib/analytics";
import { createAnalyticsEventSchema } from "./analyticsEvents.schema";

/**
 * U7 (15 Sep 2026) — the one client-facing entry point into the
 * server-side `trackEvent()` pipeline (apps/api/src/lib/analytics.ts),
 * for §8 events that only exist client-side:
 *   - `assessment.started` — OnboardingWizardContext.tsx's hydration
 *     effect finding no real draft (a genuinely fresh start, never a
 *     resume).
 *   - `assessment.resumed` — OnboardingWizardContext.tsx's secure-store
 *     draft actually resuming into a non-empty in-progress screen (U2's
 *     real resumability, gap §43).
 *   - `recommendation.viewed` — WhyThisChangedScreen/ProgressReviewScreen
 *     rendering a real Recommendation (U5, gap §47) — a render, not a
 *     mutation, so there's no server call to attach it to.
 *   - `workout.sync_recovered` — ActiveWorkoutScreen's hydration effect
 *     (U3, gap §44) actually restoring non-empty `currentExerciseIndex`/
 *     `setLogs` progress after an app kill/connectivity drop.
 * `writeRateLimit` (30/15min per IP, middleware/rateLimit.ts) applies —
 * same class of "authenticated write, real but low-stakes abuse surface"
 * as signup/payment-order-creation, per this session's own instructions.
 */
export const analyticsEventsRouter = Router();

analyticsEventsRouter.post("/analytics-events", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createAnalyticsEventSchema.parse(req.body);
    await trackEvent(req.userId!, input.name, input.entityIds, { ruleId: input.ruleId, metadata: input.metadata });
    res.status(201).json({ tracked: true });
  } catch (err) {
    next(err);
  }
});
