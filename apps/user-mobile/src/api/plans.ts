import type { Plan } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Plan-Generation Engine client (U2, 15 Sep 2026) — apps/api's
 * apps/api/src/modules/plans/plans.routes.ts. Both generate and retry are
 * synchronous from the caller's point of view: the request awaits the real
 * LLM call server-side and resolves with the FINAL status ("generated" or
 * "failed"), never "generating" — that state only exists client-side, as
 * the loading UI while the request is in flight. See PlanGeneratingScreen.
 */

export function generatePlan() {
  return apiClient.post<Plan>("/plans/generate").then((r) => r.data);
}

export function retryPlanGeneration(planId: string) {
  return apiClient.post<Plan>(`/plans/${planId}/retry`).then((r) => r.data);
}

export function fetchCurrentPlan() {
  return apiClient.get<{ plan: Plan | null }>("/plans/current").then((r) => r.data.plan);
}
