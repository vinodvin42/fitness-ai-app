import type {
  BookingConfirmation,
  CoachAvailabilityResponse,
  CoachDiscoveryResponse,
  CoachProfileDetail,
  CoachTeamResponse,
  CreateBookingInput,
  CreateChangeRequestInput,
  ProfessionalServiceType,
  RelationshipChangeRequest,
  RelationshipStatusResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Coach Discovery & Booking (25 Aug 2026) — see apps/api's
// coaching.service.ts doc comment for the full "what's real vs.
// simplified" breakdown this client surfaces as-is.

export function discoverCoaches(params: {
  serviceType?: ProfessionalServiceType | "combined";
  search?: string;
  sort?: "price" | "experience";
}) {
  return apiClient.get<CoachDiscoveryResponse>("/coaching/professionals", { params }).then((r) => r.data);
}

export function fetchCoachProfile(professionalId: string) {
  return apiClient.get<CoachProfileDetail>(`/coaching/professionals/${professionalId}`).then((r) => r.data);
}

export function fetchCoachAvailability(professionalId: string, date: string) {
  return apiClient
    .get<CoachAvailabilityResponse>(`/coaching/professionals/${professionalId}/availability`, { params: { date } })
    .then((r) => r.data);
}

export function createBooking(input: CreateBookingInput) {
  return apiClient.post<BookingConfirmation>("/coaching/bookings", input).then((r) => r.data);
}

export function fetchMyTeam() {
  return apiClient.get<CoachTeamResponse>("/coaching/team").then((r) => r.data);
}

// U6 (15 Sep 2026) — real relationship status, backing the required
// "Professional guidance request / status / active relationship entry"
// screen. See coaching.service.ts's listRelationshipStatus doc comment.
export function fetchRelationshipStatus() {
  return apiClient.get<RelationshipStatusResponse>("/coaching/relationships/status").then((r) => r.data);
}

export function submitChangeRequest(relationshipId: string, input: CreateChangeRequestInput) {
  return apiClient
    .post<RelationshipChangeRequest>(`/coaching/relationships/${relationshipId}/change-request`, input)
    .then((r) => r.data);
}
