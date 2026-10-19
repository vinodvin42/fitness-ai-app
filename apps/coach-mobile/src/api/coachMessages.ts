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
 * Coach ↔ Client Messaging — professional side (docs/coach/03-screen-
 * inventory.md), added 31 Aug 2026. Not real-time; the Thread screen polls
 * via react-query's refetchInterval. See apps/api's coachMessages.service.ts.
 */
export function fetchConversations() {
  return apiClient
    .get<CoachConversationListResponse>("/professionals/me/conversations")
    .then((r) => r.data);
}

export function fetchThread(userId: string) {
  return apiClient
    .get<CoachThreadResponse>(`/professionals/me/conversations/${userId}`)
    .then((r) => r.data);
}

export function sendMessage(userId: string, input: SendCoachMessageInput) {
  return apiClient
    .post<CoachMessageItem>(`/professionals/me/conversations/${userId}`, input)
    .then((r) => r.data);
}

/** Safety (Oct 2026): report a client, or one of their messages, to Fynrox's safety team. */
export function reportClient(userId: string, input: ReportConversationInput) {
  return apiClient.post<{ id: string; status: string }>(`/professionals/me/conversations/${userId}/report`, input).then((r) => r.data);
}

/** Block or unblock a client in chat. While either side has blocked, nobody can send. */
export function setClientBlocked(userId: string, blocked: boolean) {
  const url = `/professionals/me/conversations/${userId}/block`;
  return (blocked ? apiClient.post<CoachChatBlockState>(url) : apiClient.delete<CoachChatBlockState>(url)).then((r) => r.data);
}
