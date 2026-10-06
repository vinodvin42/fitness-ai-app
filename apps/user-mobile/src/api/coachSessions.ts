import type {
  AcceptQuoteResponse,
  BookingSummary,
  CoachBookingListItem,
  CoachBookingListResponse,
  CreateQuoteRequestInput,
  QuoteRequest,
  QuoteRequestListResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Human Coach 04-09: session summaries + quote requests. No realtime channel
// exists, so screens refetch on focus.

export function fetchCoachBookings(): Promise<CoachBookingListItem[]> {
  return apiClient.get<CoachBookingListResponse>("/coaching/bookings").then((r) => r.data.items);
}

export function fetchBookingSummary(bookingId: string) {
  return apiClient.get<BookingSummary>(`/coaching/bookings/${bookingId}/summary`).then((r) => r.data);
}

export function fetchQuoteRequests(): Promise<QuoteRequest[]> {
  return apiClient.get<QuoteRequestListResponse>("/coaching/quote-requests").then((r) => r.data.items);
}

export function fetchQuoteRequest(id: string) {
  return apiClient.get<QuoteRequest>(`/coaching/quote-requests/${id}`).then((r) => r.data);
}

export function createQuoteRequest(input: CreateQuoteRequestInput) {
  return apiClient.post<QuoteRequest>("/coaching/quote-requests", input).then((r) => r.data);
}

/** Withdraw a pending request ("Cancel request") or a received quote ("Decline quote"). */
export function cancelQuoteRequest(id: string) {
  return apiClient.post<QuoteRequest>(`/coaching/quote-requests/${id}/cancel`).then((r) => r.data);
}

export function acceptQuoteRequest(id: string) {
  return apiClient.post<AcceptQuoteResponse>(`/coaching/quote-requests/${id}/accept`).then((r) => r.data);
}
