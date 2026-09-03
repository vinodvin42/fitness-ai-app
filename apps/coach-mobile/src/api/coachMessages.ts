import type {
  CoachConversationListResponse,
  CoachThreadResponse,
  CoachMessageItem,
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
