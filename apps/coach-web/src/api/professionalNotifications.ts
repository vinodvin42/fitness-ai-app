import type { ProfessionalNotificationListResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/** The coach inbox (26 Oct 2026): what happened, newest first. See apps/api's professionalNotifications.service.ts. */
export function fetchNotifications(before?: string) {
  return apiClient
    .get<ProfessionalNotificationListResponse>("/professionals/me/notifications", { params: before ? { before } : undefined })
    .then((r) => r.data);
}

export function markNotificationRead(id: string) {
  return apiClient.post(`/professionals/me/notifications/${id}/read`).then((r) => r.data);
}

export function markAllNotificationsRead() {
  return apiClient.post<{ marked: number }>("/professionals/me/notifications/read-all").then((r) => r.data);
}
