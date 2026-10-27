import type { CoachScheduleResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/** Backs the real Calendar tab — see apps/api's coaching.service.ts's listMySchedule doc comment. */
export function fetchMySchedule() {
  return apiClient.get<CoachScheduleResponse>("/professionals/me/schedule").then((r) => r.data);
}

/** The coach's own grid for one day (YYYY-MM-DD), the same slots members book from (27 Oct 2026). */
export function fetchMyAvailability(date: string) {
  return apiClient
    .get<{ date: string; slots: { time: string; available: boolean }[] }>("/professionals/me/availability", { params: { date } })
    .then((r) => r.data);
}

/** Propose a new time; the member accepts it or declines for a session credit. See apps/api's bookingChanges.service.ts. */
export function proposeNewTime(bookingId: string, scheduledAt: string) {
  return apiClient.post(`/professionals/me/bookings/${bookingId}/propose-time`, { scheduledAt }).then((r) => r.data);
}

export function withdrawProposal(bookingId: string) {
  return apiClient.post(`/professionals/me/bookings/${bookingId}/withdraw-proposal`).then((r) => r.data);
}
