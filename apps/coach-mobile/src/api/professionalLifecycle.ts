import type { ProfessionalLifecycleSummary, UpdateMaxActiveClientsInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * R2 Wave 2 (20 Sep 2026) — the coach-side read/write for the real
 * account-level lifecycle + capacity Developer 2's R1 work package shipped
 * in R2 Wave 1 (`apps/api/src/modules/professionalLifecycle`). No
 * coach-mobile UI called either endpoint before this wave — see
 * AvailabilityScreen.tsx's own doc comment for where this is now surfaced.
 */
export function fetchLifecycleSummary() {
  return apiClient.get<ProfessionalLifecycleSummary>("/professionals/me/lifecycle").then((r) => r.data);
}

export function updateMyCapacity(input: UpdateMaxActiveClientsInput) {
  return apiClient
    .put<{ maxActiveClients: number }>("/professionals/me/capacity", input)
    .then((r) => r.data);
}
