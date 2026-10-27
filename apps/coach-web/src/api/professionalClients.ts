import type {
  CoachClientListResponse,
  CoachClientProfile,
  CoachClientRecommendationsResponse,
  CoachClientSummary,
  DecideRecommendationInput,
  Recommendation,
} from "@fitness-ai-app/types";
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

/**
 * Client Recommendation review (Wave 2.4, 20 Sep 2026) — the coach-side
 * counterpart to apps/user-mobile's own recommendations.ts client. See
 * apps/api's professionalClients.routes.ts for the real active-Relationship
 * gate behind both calls below.
 */
export function fetchClientRecommendations(userId: string) {
  return apiClient
    .get<CoachClientRecommendationsResponse>(`/professionals/me/clients/${userId}/recommendations`)
    .then((r) => r.data.recommendations);
}

export function decideClientRecommendation(userId: string, recommendationId: string, input: DecideRecommendationInput) {
  return apiClient
    .post<Recommendation>(`/professionals/me/clients/${userId}/recommendations/${recommendationId}/decide`, input)
    .then((r) => r.data);
}

/**
 * P-M12 — raise a safety concern about a client. Deliberately not a chat
 * message: chat is not monitored and is not an escalation.
 */
export function flagClientSafety(userId: string, input: { concern: string; urgent: boolean }) {
  return apiClient
    .post<{ id: string; raised: boolean }>(`/professionals/me/clients/${userId}/safety-flag`, input)
    .then((r) => r.data);
}
