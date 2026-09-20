import type { CoachClientListResponse, CoachClientProfile, CoachClientSummary } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Coach Client Profile (docs/coach/03-screen-inventory.md §D), added 31 Aug
 * 2026 — professional-authed, the coach's own active clients. See apps/api's
 * professionalClients.service.ts for the authorization + sensitive-data
 * boundaries.
 */
export function fetchClients() {
  return apiClient
    .get<CoachClientListResponse>("/professionals/me/clients")
    .then((r) => r.data);
}

export function fetchClientProfile(userId: string) {
  return apiClient
    .get<CoachClientProfile>(`/professionals/me/clients/${userId}`)
    .then((r) => r.data);
}

/**
 * Client 360 (Wave 2, 20 Sep 2026) — real assessment/training/nutrition/
 * check-in summaries, gated server-side on the client's own
 * `health_data_processing` Consent. See apps/api's
 * professionalClients.service.ts's getClientSummary doc comment.
 */
export function fetchClientSummary(userId: string) {
  return apiClient
    .get<CoachClientSummary>(`/professionals/me/clients/${userId}/summary`)
    .then((r) => r.data);
}
