import type { CoachScheduleResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/** Backs the real Calendar tab — see apps/api's coaching.service.ts's listMySchedule doc comment. */
export function fetchMySchedule() {
  return apiClient.get<CoachScheduleResponse>("/professionals/me/schedule").then((r) => r.data);
}
