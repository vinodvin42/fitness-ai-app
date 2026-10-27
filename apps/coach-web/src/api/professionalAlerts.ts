import type { CoachAlertsResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * The Alerts badge counts (25 Oct 2026): waiting requests, open Fynrox offers,
 * and bookings made after `bookingsSince`. See apps/api's
 * professionalAlerts.service.ts.
 */
export function fetchCoachAlerts(bookingsSince: string | null) {
  return apiClient
    .get<CoachAlertsResponse>("/professionals/me/alerts", {
      params: bookingsSince ? { bookingsSince } : undefined,
    })
    .then((r) => r.data);
}
