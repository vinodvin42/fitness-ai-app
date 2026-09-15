import type { DecideRecommendationInput, Recommendation } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Recommendation Engine client (U5, 15 Sep 2026) — apps/api's
 * apps/api/src/modules/plans/plans.routes.ts. Same module as api/plans.ts
 * (Plan-Generation), same "server call is synchronous and resolves with the
 * FINAL state" convention: POST /recommendations/generate awaits the real
 * LLM call and returns an "active" Recommendation ready to review, never a
 * pending/generating one — there's no persisted in-between state to poll.
 * Zero mobile consumer existed before this pass (see docs/mobile's own gap
 * §44 for the identical situation the sibling Plan-Generation engine was in
 * before U3) — apps/api's engine and its full test suite
 * (apps/api/tests/plans.test.ts) already covered generate/decide
 * (accept/decline/modify, no_change, already-decided 409) end to end, so
 * this pass is purely the missing client wiring, not new backend logic.
 */

/** Grounded in the user's real recent WorkoutSession/BodyMeasurement data — never fabricated activity. Requires an active generated Plan (404 `no_active_plan` otherwise). */
export function generateRecommendation() {
  return apiClient.post<Recommendation>("/recommendations/generate").then((r) => r.data);
}

/** The one live, undecided Recommendation for this user, if any — null once it's been decided (accepted/declined/modified/no_change) or superseded by a newer one. */
export function fetchCurrentRecommendation() {
  return apiClient.get<{ recommendation: Recommendation | null }>("/recommendations/current").then((r) => r.data.recommendation);
}

/** Accept / decline / modify an active Recommendation. See plans.service.ts's decideRecommendation for what each action actually does server-side. */
export function decideRecommendation(recommendationId: string, input: DecideRecommendationInput) {
  return apiClient.post<Recommendation>(`/recommendations/${recommendationId}/decide`, input).then((r) => r.data);
}
