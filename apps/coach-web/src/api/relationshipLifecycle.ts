import type {
  AvailableProfessionalsResponse,
  HandoverRelationshipInput,
  RelationshipEndActionInput,
  RelationshipEndResponse,
  RelationshipHandoverResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Relationship Lifecycle — End Relationship / Handover (R1 U6, Wave 3,
 * 20 Sep 2026) — the real professional-initiated actions from
 * ClientProfileScreen.tsx, backed by apps/api's
 * relationshipLifecycle.service.ts. Professional-authed, same
 * `/professionals/me/...` convention as relationshipRequests.ts/
 * professionalOffers.ts.
 */
export function endRelationship(relationshipId: string, input: RelationshipEndActionInput) {
  return apiClient
    .post<RelationshipEndResponse>(`/professionals/me/relationships/${relationshipId}/end`, input)
    .then((r) => r.data);
}

export function handoverRelationship(relationshipId: string, input: HandoverRelationshipInput) {
  return apiClient
    .post<RelationshipHandoverResponse>(`/professionals/me/relationships/${relationshipId}/handover`, input)
    .then((r) => r.data);
}

/**
 * The replacement-professional picker's data source — reuses
 * professionalOffers.service.ts's own `listAvailableProfessionals` (the
 * exact function admin-web's Propose Professional dropdown already uses),
 * excluding the calling coach's own id server-side.
 */
export function fetchAvailableProfessionalsForHandover(search?: string) {
  return apiClient
    .get<AvailableProfessionalsResponse>("/professionals/me/available-professionals", {
      params: search ? { search } : undefined,
    })
    .then((r) => r.data);
}

/**
 * P-M11 — complete a programme. §10 makes COMPLETED distinct from ENDED:
 * ending says the arrangement stopped, completing says the work finished.
 */
export function completeRelationship(relationshipId: string, reason: string) {
  return apiClient
    .post(`/professionals/me/relationships/${relationshipId}/complete`, { reason })
    .then((r) => r.data);
}
