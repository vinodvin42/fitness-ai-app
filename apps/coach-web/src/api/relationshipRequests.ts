import type { DeclineRelationshipInput, PendingRelationshipsResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * The real coach-side review gate (gap §56) — Pending Requests, backed by
 * apps/api's coaching.service.ts's listPendingRelationships/
 * acceptRelationship/declineRelationship. Professional-authed, same
 * `/professionals/me/...` convention as professionalClients.ts/coaching.ts.
 */
export function fetchPendingRelationships() {
  return apiClient
    .get<PendingRelationshipsResponse>("/professionals/me/relationships/requests")
    .then((r) => r.data);
}

export function acceptRelationshipRequest(relationshipId: string) {
  return apiClient
    .post(`/professionals/me/relationships/${relationshipId}/accept`)
    .then((r) => r.data);
}

export function declineRelationshipRequest(relationshipId: string, input: DeclineRelationshipInput = {}) {
  return apiClient
    .post(`/professionals/me/relationships/${relationshipId}/decline`, input)
    .then((r) => r.data);
}
