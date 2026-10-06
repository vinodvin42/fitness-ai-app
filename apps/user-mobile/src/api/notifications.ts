import type {
  DismissNotificationResponse,
  MarkAllNotificationsReadResponse,
  Notification,
  NotificationCategory,
  NotificationPreferences,
  NotificationsResponse,
  PushTokenRegistration,
  RegisterPushTokenInput,
  UpdateNotificationPreferencesInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchNotifications(params: { filter?: "unread"; category?: NotificationCategory; cursor?: string | null; limit?: number } = {}) {
  return apiClient
    .get<NotificationsResponse>("/notifications", {
      params: { filter: params.filter, category: params.category, cursor: params.cursor ?? undefined, limit: params.limit ?? 50 },
    })
    .then((r) => r.data);
}

export function markNotificationRead(id: string) {
  return apiClient.post<Notification>(`/notifications/${id}/read`).then((r) => r.data);
}

/** Swipe-to-dismiss: hides the notification from every list (kept server-side). */
export function dismissNotification(id: string) {
  return apiClient.post<DismissNotificationResponse>(`/notifications/${id}/dismiss`).then((r) => r.data);
}

export function markAllNotificationsRead() {
  return apiClient.post<MarkAllNotificationsReadResponse>("/notifications/read-all").then((r) => r.data);
}

export function registerPushToken(input: RegisterPushTokenInput) {
  return apiClient.post<PushTokenRegistration>("/devices/push-token", input).then((r) => r.data);
}

export function unregisterPushToken(token: string) {
  return apiClient.delete("/devices/push-token", { data: { token } }).then(() => undefined);
}

export function fetchNotificationPreferences() {
  return apiClient.get<NotificationPreferences>("/users/me/notification-preferences").then((r) => r.data);
}

export function updateNotificationPreferences(input: UpdateNotificationPreferencesInput) {
  return apiClient.patch<NotificationPreferences>("/users/me/notification-preferences", input).then((r) => r.data);
}
