import type { JourneyReport, TimelineEvent, TimelineMonthDetail, TimelineSummary } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchTimeline() {
  return apiClient.get<{ items: TimelineEvent[] }>("/timeline").then((r) => r.data.items);
}

/** Member Since / Active Time / Milestones stats and the period insight (Figma Progress 08). */
export function fetchTimelineSummary() {
  return apiClient.get<TimelineSummary>("/timeline/summary").then((r) => r.data);
}

/** One month's detail (Figma Progress 09). `month` is 0-11. */
export function fetchTimelineMonth(year: number, month: number) {
  return apiClient.get<TimelineMonthDetail>(`/timeline/months/${year}/${month}`).then((r) => r.data);
}

/** Longitudinal Journey Report (Figma Progress 11). */
export function fetchJourneyReport() {
  return apiClient.get<JourneyReport>("/timeline/report").then((r) => r.data);
}
