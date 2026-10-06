import type { AnalyticsRange, TrainingAnalytics } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/** Train 12 - weekly volume, ACWR, muscle distribution and PRs for the chosen window. */
export function fetchTrainingAnalytics(range: AnalyticsRange) {
  return apiClient.get<TrainingAnalytics>("/training/analytics", { params: { range } }).then((r) => r.data);
}
