import type {
  CoachChatBlockState,
  CoachConversationListResponse,
  CoachThreadResponse,
  CoachMessageItem,
  ReportConversationInput,
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

/** Safety (Oct 2026): report your coach, or one of their messages, to Fynrox's safety team. */
export function reportCoach(professionalId: string, input: ReportConversationInput) {
  return apiClient.post<{ id: string; status: string }>(`/coaching/conversations/${professionalId}/report`, input).then((r) => r.data);
}

/** Block or unblock your coach in chat. While either side has blocked, nobody can send. */
export function setCoachBlocked(professionalId: string, blocked: boolean) {
  const url = `/coaching/conversations/${professionalId}/block`;
  return (blocked ? apiClient.post<CoachChatBlockState>(url) : apiClient.delete<CoachChatBlockState>(url)).then((r) => r.data);
}
