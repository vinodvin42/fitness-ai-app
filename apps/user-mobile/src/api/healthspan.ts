import type { HealthReading, HealthReadingInput, HealthspanAnswers, HealthspanSummary, LongTermTrends } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Healthspan (25 Oct 2026): fitness age, heart age, blood-pressure / VO2max
 * readings and 12-month trends. Formulas and sources: apps/api
 * modules/healthspan/healthspan.math.ts.
 */
export const HEALTHSPAN_KEY = ["healthspan"] as const;

export function fetchHealthspan() {
  return apiClient.get<HealthspanSummary>("/healthspan").then((r) => r.data);
}

export function saveHealthspanAnswers(input: HealthspanAnswers) {
  return apiClient.put<HealthspanAnswers>("/healthspan/answers", input).then((r) => r.data);
}

export function fetchHealthReadings(kind: HealthReading["kind"]) {
  return apiClient.get<{ items: HealthReading[] }>("/healthspan/readings", { params: { kind } }).then((r) => r.data.items);
}

export function addHealthReading(input: HealthReadingInput) {
  return apiClient.post<HealthReading>("/healthspan/readings", input).then((r) => r.data);
}

export function fetchLongTermTrends(months: number) {
  return apiClient.get<LongTermTrends>("/healthspan/trends", { params: { months } }).then((r) => r.data);
}
