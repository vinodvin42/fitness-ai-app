import type {
  BookingConfirmation,
  BookingSummary,
  CancelBookingResponse,
  CoachBookingListItem,
  CoachBookingListResponse,
  CreateBookingInput,
  RescheduleBookingInput,
  RescheduledBooking,
  SessionCreditItem,
  SessionCreditListResponse,
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

/** Move a session up to 24 hours before it starts (Figma coach/15, 25 Oct 2026). */
export function rescheduleBooking(bookingId: string, scheduledAt: string) {
  return apiClient.post<RescheduledBooking>(`/coaching/bookings/${bookingId}/reschedule`, { scheduledAt } satisfies RescheduleBookingInput).then((r) => r.data);
}

export function fetchSessionRating(bookingId: string) {
  return apiClient.get<{ rating: SessionRating | null }>(`/coaching/bookings/${bookingId}/rating`).then((r) => r.data.rating);
}

export function rateSession(bookingId: string, input: { stars: number; tags: SessionRatingTag[]; comment?: string }) {
  return apiClient.put<{ rating: SessionRating }>(`/coaching/bookings/${bookingId}/rating`, input).then((r) => r.data.rating);
}

// Booking changes (27 Oct 2026, apps/api bookingChanges.service.ts): a member can cancel any time before the
// session starts and gets a session credit worth what they paid (no cash refund); a coach can propose a new
// time, which the member accepts (the session moves) or declines (cancelled, credit given). A credit pays for
// one session whose full price (fee + GST) it covers; the difference isn't refunded.

/** How long a session credit lasts; mirrors CREDIT_VALIDITY_DAYS in the API. Only used in copy. */
export const SESSION_CREDIT_VALIDITY_DAYS = 90;

export function cancelBooking(bookingId: string) {
  return apiClient.post<CancelBookingResponse>(`/coaching/bookings/${bookingId}/cancel`).then((r) => r.data);
}

export function acceptProposal(bookingId: string) {
  return apiClient.post<{ bookingId: string; scheduledAt: string }>(`/coaching/bookings/${bookingId}/proposal/accept`).then((r) => r.data);
}

/** Same response as cancelBooking: the session is cancelled and the member gets a credit. */
export function declineProposal(bookingId: string) {
  return apiClient.post<CancelBookingResponse>(`/coaching/bookings/${bookingId}/proposal/decline`).then((r) => r.data);
}

/** Unspent, unexpired credits, soonest-expiring first. */
export function fetchCredits(): Promise<SessionCreditItem[]> {
  return apiClient.get<SessionCreditListResponse>("/coaching/credits").then((r) => r.data.items);
}

/** Books a session paid for with a credit instead of Razorpay; same response as POST /coaching/bookings. */
export function bookWithCredit(input: CreateBookingInput & { creditId: string }) {
  return apiClient.post<BookingConfirmation>("/coaching/bookings/with-credit", input).then((r) => r.data);
}
