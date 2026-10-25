import type { BookingSummary, PublishBookingSummaryInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Session summaries (25 Oct 2026): the coach's write-up of a session that has
 * started, which the client reads in their app (GET /coaching/bookings/:id/
 * summary). See apps/api's coachSummaries.service.ts#publishBookingSummary:
 * only a confirmed session, once it has started, and publishing again
 * replaces the earlier text.
 */
export function publishBookingSummary(bookingId: string, input: PublishBookingSummaryInput) {
  return apiClient
    .post<BookingSummary>(`/professionals/me/bookings/${bookingId}/summary`, input)
    .then((r) => r.data);
}

/** The coach's read-back of what they published; summaryText is null until then (getMyBookingSummary). */
export function fetchBookingSummary(bookingId: string) {
  return apiClient.get<BookingSummary>(`/professionals/me/bookings/${bookingId}/summary`).then((r) => r.data);
}
