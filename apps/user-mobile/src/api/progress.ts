import type {
  BodyMeasurement,
  CreateProgressPhotoInput,
  LogMeasurementInput,
  ProgressOverview,
  ProgressPhoto,
  StreakSummary,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchProgressOverview() {
  return apiClient.get<ProgressOverview>("/progress/overview").then((r) => r.data);
}

/** Per-category (training/nutrition/hydration) streaks — backs Streak Tracker. */
export function fetchStreaks() {
  return apiClient.get<StreakSummary>("/progress/streaks").then((r) => r.data);
}

export function fetchMeasurements() {
  return apiClient.get<{ items: BodyMeasurement[] }>("/measurements").then((r) => r.data.items);
}

export function logMeasurement(input: LogMeasurementInput) {
  return apiClient.post<BodyMeasurement>("/measurements", input).then((r) => r.data);
}

export function fetchProgressPhotos() {
  return apiClient.get<{ items: ProgressPhoto[] }>("/progress-photos").then((r) => r.data.items);
}

export function createProgressPhoto(input: CreateProgressPhotoInput) {
  return apiClient.post<ProgressPhoto>("/progress-photos", input).then((r) => r.data);
}

export function deleteProgressPhoto(photoId: string) {
  return apiClient.delete(`/progress-photos/${photoId}`).then((r) => r.data);
}
