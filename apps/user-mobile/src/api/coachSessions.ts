import type {
  BookingSummary,
  CoachBookingListItem,
  CoachBookingListResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Human Coach 04-09: session summaries. No realtime channel
// exists, so screens refetch on focus.

export function fetchCoachBookings(): Promise<CoachBookingListItem[]> {
  return apiClient.get<CoachBookingListResponse>("/coaching/bookings").then((r) => r.data.items);
}

export function fetchBookingSummary(bookingId: string) {
  return apiClient.get<BookingSummary>(`/coaching/bookings/${bookingId}/summary`).then((r) => r.data);
}
