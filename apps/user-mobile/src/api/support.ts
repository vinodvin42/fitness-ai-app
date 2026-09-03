import type {
  CreateSupportTicketInput,
  SendSupportTicketMessageInput,
  SupportTicket,
  SupportTicketDetailResponse,
  SupportTicketMessage,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchMyTickets() {
  return apiClient.get<{ items: SupportTicket[] }>("/support/tickets").then((r) => r.data.items);
}

export function createTicket(input: CreateSupportTicketInput) {
  return apiClient.post<SupportTicket>("/support/tickets", input).then((r) => r.data);
}

// Support Ticket Messages (added 3 Sep 2026) — see SupportTicketDetailScreen.tsx.
export function fetchTicketDetail(ticketId: string) {
  return apiClient.get<SupportTicketDetailResponse>(`/support/tickets/${ticketId}`).then((r) => r.data);
}

export function sendTicketMessage(ticketId: string, input: SendSupportTicketMessageInput) {
  return apiClient.post<SupportTicketMessage>(`/support/tickets/${ticketId}/messages`, input).then((r) => r.data);
}
