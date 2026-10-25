import type {
  BookingConfirmation,
  CoachAvailabilityResponse,
  CoachDiscoveryResponse,
  CoachProfileDetail,
  CoachTeamResponse,
  CreateBookingInput,
  CreateChangeRequestInput,
  CreateGuidanceRequestInput,
  GuidanceRequestResult,
  ProfessionalServiceType,
  ProfilePhoto,
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
  gender?: "male" | "female";
  /** 25 Oct 2026: only professionals who coach in this language (ISO 639-1, SPOKEN_LANGUAGES). */
  language?: string;
}) {
  return apiClient.get<CoachDiscoveryResponse>("/coaching/professionals", { params }).then((r) => r.data);
}

export function fetchCoachProfile(professionalId: string) {
  return apiClient.get<CoachProfileDetail>(`/coaching/professionals/${professionalId}`).then((r) => r.data);
}

/** A professional's profile photo (25 Oct 2026), or null when they haven't set one. */
export function fetchCoachPhoto(professionalId: string) {
  return apiClient.get<{ photo: ProfilePhoto | null }>(`/coaching/professionals/${professionalId}/photo`).then((r) => r.data.photo);
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

/** Ask a coach for guidance with no payment and no exact slot (25 Oct 2026, Figma coach/02). */
export function requestGuidanceFromCoach(input: CreateGuidanceRequestInput) {
  return apiClient.post<GuidanceRequestResult>("/coaching/relationships/request", input).then((r) => r.data);
}

/** Take a request back while it is waiting for the coach, or accepted but not yet paid. */
export function cancelCoachRequest(relationshipId: string) {
  return apiClient.post<{ id: string; status: "ended" }>(`/coaching/relationships/${relationshipId}/cancel`).then((r) => r.data);
}

export function submitChangeRequest(relationshipId: string, input: CreateChangeRequestInput) {
  return apiClient
    .post<RelationshipChangeRequest>(`/coaching/relationships/${relationshipId}/change-request`, input)
    .then((r) => r.data);
}
