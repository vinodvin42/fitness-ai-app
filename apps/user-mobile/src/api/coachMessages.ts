import type {
  CoachConversationListResponse,
  CoachThreadResponse,
  CoachMessageItem,
  SendCoachMessageInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Coach ↔ Client Messaging — consumer side (docs/coach/03-screen-inventory.md),
 * added 31 Aug 2026. The "partner" is always the professional here. Not
 * real-time; the thread screen polls via react-query refetchInterval. See
 * apps/api's coachMessages.service.ts.
 */
export function fetchConversations() {
  return apiClient
    .get<CoachConversationListResponse>("/coaching/conversations")
    .then((r) => r.data);
}

export function fetchThread(professionalId: string) {
  return apiClient
    .get<CoachThreadResponse>(`/coaching/conversations/${professionalId}`)
    .then((r) => r.data);
}

export function sendMessage(professionalId: string, input: SendCoachMessageInput) {
  return apiClient
    .post<CoachMessageItem>(`/coaching/conversations/${professionalId}`, input)
    .then((r) => r.data);
}
