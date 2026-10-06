import type {
  BodyComposition,
  BodyMeasurement,
  CheckIn,
  CheckInStatus,
  CreateProgressPhotoInput,
  LogMeasurementInput,
  LogMindfulnessInput,
  MindfulnessLog,
  ProgressInsights,
  ProgressOverview,
  ProgressPhoto,
  StreakSummary,
  SubmitCheckInInput,
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

/** Check-In (U5) — whether today's/this week's check-in is already submitted, and the real entry if so. */
export function fetchCheckInStatus() {
  return apiClient.get<CheckInStatus>("/check-ins/status").then((r) => r.data);
}

/** Recent Check-Ins, newest first — backs the Check-In screen's history strip. */
export function fetchCheckIns() {
  return apiClient.get<{ items: CheckIn[] }>("/check-ins").then((r) => r.data.items);
}

export function submitCheckIn(input: SubmitCheckInInput) {
  return apiClient.post<CheckIn>("/check-ins", input).then((r) => r.data);
}

/** Mindfulness log (22 Sep 2026, gap §29) — the Recovery screen's "Log Mindfulness Session" action, and the source for Streak Tracker's mindfulness category. */
export function fetchTodayMindfulnessLogs() {
  return apiClient.get<{ items: MindfulnessLog[] }>("/mindfulness-logs/today").then((r) => r.data.items);
}

export function logMindfulness(input: LogMindfulnessInput) {
  return apiClient.post<MindfulnessLog>("/mindfulness-logs", input).then((r) => r.data);
}

/** Body Composition (Figma Progress 02): latest body-fat / derived lean mass / BMI / waist-hip, 6-month trend, optional smart-scale card. */
export function fetchBodyComposition() {
  return apiClient.get<BodyComposition>("/progress/composition").then((r) => r.data);
}

/** Rule-based insight cards (Figma Progress 07) - only cards computable from real data are returned. */
export function fetchProgressInsights() {
  return apiClient.get<ProgressInsights>("/progress/insights").then((r) => r.data);
}
