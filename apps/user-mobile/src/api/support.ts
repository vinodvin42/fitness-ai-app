import type { CreateSupportTicketInput, SupportTicket } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchMyTickets() {
  return apiClient.get<{ items: SupportTicket[] }>("/support/tickets").then((r) => r.data.items);
}

export function createTicket(input: CreateSupportTicketInput) {
  return apiClient.post<SupportTicket>("/support/tickets", input).then((r) => r.data);
}
