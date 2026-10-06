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

export function sendAiCoachMessage(content: string) {
  return apiClient.post<SendAiCoachMessageResponse>("/ai-coach/messages", { content }).then((r) => r.data);
}

export function fetchAiCoachUsage() {
  return apiClient.get<AiCoachUsage>("/ai-coach/usage").then((r) => r.data);
}
