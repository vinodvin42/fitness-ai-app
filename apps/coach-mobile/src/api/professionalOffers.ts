import type {
  DeclineOfferInput,
  ProfessionalOffersForCoachResponse,
  RespondToOfferResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * R2 Wave 2 (20 Sep 2026) — "Offers from FynroX", the coach-side half of
 * the admin-proposes-a-specific-pro flow (professionalOffers.service.ts).
 * Distinct from relationshipRequests.ts's own Pending Requests API: those
 * are real, already-existing Relationship rows a USER asked for; these are
 * ProfessionalOffer rows FynroX itself proposed, which only become a
 * Relationship once accepted here. Same `/professionals/me/...`
 * professional-authed convention.
 */
export function fetchProfessionalOffers() {
  return apiClient
    .get<ProfessionalOffersForCoachResponse>("/professionals/me/offers")
    .then((r) => r.data);
}

export function acceptProfessionalOffer(offerId: string) {
  return apiClient
    .post<RespondToOfferResponse>(`/professionals/me/offers/${offerId}/accept`)
    .then((r) => r.data);
}

export function declineProfessionalOffer(offerId: string, input: DeclineOfferInput = {}) {
  return apiClient
    .post<RespondToOfferResponse>(`/professionals/me/offers/${offerId}/decline`, input)
    .then((r) => r.data);
}
