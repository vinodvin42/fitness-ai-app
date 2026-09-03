import type { CreateReminderInput, Reminder, UpdateReminderInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchReminders() {
  return apiClient.get<{ items: Reminder[] }>("/reminders").then((r) => r.data.items);
}

export function createReminder(input: CreateReminderInput) {
  return apiClient.post<Reminder>("/reminders", input).then((r) => r.data);
}

export function updateReminder(id: string, input: UpdateReminderInput) {
  return apiClient.patch<Reminder>(`/reminders/${id}`, input).then((r) => r.data);
}

export function deleteReminder(id: string) {
  return apiClient.delete(`/reminders/${id}`).then(() => undefined);
}
