import type { CoachEarningsResponse, ProfessionalDashboardStats } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchDashboardStats() {
  return apiClient.get<ProfessionalDashboardStats>("/professionals/me/dashboard").then((r) => r.data);
}

/** Coach Earnings (31 Aug 2026) — see apps/api's professionalDashboard.service.ts getEarnings. */
export function fetchEarnings() {
  return apiClient.get<CoachEarningsResponse>("/professionals/me/earnings").then((r) => r.data);
}
