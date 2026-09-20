import type {
  CoachClientListResponse,
  CoachClientProfile,
  CoachClientRecommendationsResponse,
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
