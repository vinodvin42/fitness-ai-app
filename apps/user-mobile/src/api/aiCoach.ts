import type {
  AiCoachMessagesResponse,
  AiCoachUsage,
  AiProviderStatus,
  SendAiCoachMessageResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchAiProviderStatus() {
  return apiClient.get<AiProviderStatus>("/ai/status").then((r) => r.data);
}

export function fetchAiCoachMessages() {
  return apiClient.get<AiCoachMessagesResponse>("/ai-coach/messages").then((r) => r.data);
}

/** `clientId` is an idempotency key: resend the same one to retry a failed send without duplicating the message. */
export function sendAiCoachMessage(content: string, clientId?: string) {
  return apiClient.post<SendAiCoachMessageResponse>("/ai-coach/messages", { content, clientId }).then((r) => r.data);
}

export function clearAiCoachConversation() {
  return apiClient.delete<{ deleted: number }>("/ai-coach/messages").then((r) => r.data);
}

export function fetchAiCoachUsage() {
  return apiClient.get<AiCoachUsage>("/ai-coach/usage").then((r) => r.data);
}
