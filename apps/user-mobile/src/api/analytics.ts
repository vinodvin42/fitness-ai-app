import { apiClient } from "./client";

/**
 * U7 (15 Sep 2026) — client-facing companion to apps/api's
 * `POST /analytics-events` (analyticsEvents.routes.ts), which funnels
 * into the same server-side `trackEvent()` every domain module uses. Only
 * for the handful of §8 events that are inherently CLIENT-side — a screen
 * rendering, a local draft resuming, a hydration effect restoring
 * progress — see analyticsEvents.schema.ts's own `clientAnalyticsEventNames`
 * for the exact closed set this endpoint accepts.
 *
 * Deliberately a plain fire-and-forget POST, not a queue/batching system:
 * never awaited by the caller's own UI flow, and a failure here is
 * swallowed (see `trackClientEvent`'s own try/catch) — losing one
 * analytics event is a real, acceptable gap; blocking or crashing a
 * screen over it would not be.
 */

export type ClientAnalyticsEventName =
  | "assessment.started"
  | "assessment.resumed"
  | "recommendation.viewed"
  | "workout.sync_recovered";

export function trackClientEvent(
  name: ClientAnalyticsEventName,
  entityIds?: Record<string, string | null>,
  metadata?: Record<string, unknown>,
) {
  apiClient.post("/analytics-events", { name, entityIds, metadata }).catch(() => {
    // Best-effort — an analytics event failing to record must never
    // surface to the user or interrupt whatever real flow triggered it.
  });
}
