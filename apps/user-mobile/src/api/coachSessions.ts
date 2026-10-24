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

// Figma coach/11 "How was your session?" (24 Oct 2026): private to the coach.
export type SessionRatingTag = "clear_guidance" | "on_time" | "useful_plan_changes" | "good_listener";
export interface SessionRating {
  stars: number;
  tags: SessionRatingTag[];
  comment: string | null;
  updatedAt: string;
}

export function fetchSessionRating(bookingId: string) {
  return apiClient.get<{ rating: SessionRating | null }>(`/coaching/bookings/${bookingId}/rating`).then((r) => r.data.rating);
}

export function rateSession(bookingId: string, input: { stars: number; tags: SessionRatingTag[]; comment?: string }) {
  return apiClient.put<{ rating: SessionRating }>(`/coaching/bookings/${bookingId}/rating`, input).then((r) => r.data.rating);
}
