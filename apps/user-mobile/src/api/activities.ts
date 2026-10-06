import type {
  ActivityKind,
  ActivityListResponse,
  ActivityLog,
  ActivitySummary,
  ActivitySummaryRange,
  CreateActivityInput,
  DeleteResult,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchActivities(kind?: ActivityKind) {
  return apiClient
    .get<ActivityListResponse>("/activities", { params: kind ? { kind } : undefined })
    .then((r) => r.data.items);
}

export function fetchActivitySummary(kind: ActivityKind, range: ActivitySummaryRange) {
  return apiClient.get<ActivitySummary>("/activities/summary", { params: { kind, range } }).then((r) => r.data);
}

export function fetchActivity(id: string) {
  return apiClient.get<ActivityLog>(`/activities/${id}`).then((r) => r.data);
}

export function createActivity(input: CreateActivityInput) {
  return apiClient.post<ActivityLog>("/activities", input).then((r) => r.data);
}

export function deleteActivity(id: string) {
  return apiClient.delete<DeleteResult>(`/activities/${id}`).then((r) => r.data);
}
