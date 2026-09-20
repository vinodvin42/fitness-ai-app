import type { CoachNote, CoachNoteInput, CoachNoteListResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Coach Private Notes (R2 Wave 3, 20 Sep 2026) — professional-authed, the
 * coach's own private notes about one client. See apps/api's
 * coachNotes.service.ts for the active-vs-any-relationship create/read gate
 * and cross-coach isolation this API enforces server-side.
 */
export function fetchClientNotes(userId: string) {
  return apiClient
    .get<CoachNoteListResponse>(`/professionals/me/clients/${userId}/notes`)
    .then((r) => r.data.notes);
}

export function createClientNote(userId: string, input: CoachNoteInput) {
  return apiClient
    .post<CoachNote>(`/professionals/me/clients/${userId}/notes`, input)
    .then((r) => r.data);
}

export function updateClientNote(userId: string, noteId: string, input: CoachNoteInput) {
  return apiClient
    .patch<CoachNote>(`/professionals/me/clients/${userId}/notes/${noteId}`, input)
    .then((r) => r.data);
}

export function deleteClientNote(userId: string, noteId: string) {
  return apiClient.delete<void>(`/professionals/me/clients/${userId}/notes/${noteId}`).then(() => undefined);
}
