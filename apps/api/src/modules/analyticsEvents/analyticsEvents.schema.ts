import { z } from "zod";

/**
 * U7 (15 Sep 2026) — the client-facing half of `trackEvent()`
 * (apps/api/src/lib/analytics.ts) for the handful of §8 events that are
 * inherently CLIENT-side: something that happens only in the UI, with no
 * natural server call to hang a `trackEvent()` off of (a screen
 * rendering, a local draft resuming from secure-store, a resume-hydration
 * effect finding non-empty progress). See analyticsEvents.routes.ts's own
 * doc comment for the full list and why each is client-only.
 *
 * `name` is a closed enum, NOT free text — unlike the server's own
 * internal `trackEvent()` calls (which name whatever event they're
 * actually emitting, trusted because they're server code), this endpoint
 * is reachable by any authenticated mobile client, so accepting an
 * arbitrary string here would let a client write arbitrary event names
 * into the analytics stream. Restricting to the real, known client-only
 * event set keeps this endpoint honest about what it's actually for.
 */
export const clientAnalyticsEventNames = [
  "assessment.started",
  "assessment.resumed",
  "recommendation.viewed",
  "workout.sync_recovered",
] as const;

export const createAnalyticsEventSchema = z.object({
  name: z.enum(clientAnalyticsEventNames),
  entityIds: z.record(z.union([z.string().max(191), z.null()])).optional(),
  ruleId: z.string().trim().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateAnalyticsEventInput = z.infer<typeof createAnalyticsEventSchema>;
