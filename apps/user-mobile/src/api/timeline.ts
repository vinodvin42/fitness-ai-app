import type { TimelineEvent } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchTimeline() {
  return apiClient.get<{ items: TimelineEvent[] }>("/timeline").then((r) => r.data.items);
}
