import type { ReadinessResponse, RecoveryResponse, RecoveryLogItem, UpsertRecoveryInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Recovery & Devices — manual-entry stopgap (added 31 Aug 2026). See
 * apps/api's recovery.service.ts for why this is self-reported data, not a
 * device feed.
 */
export function fetchRecovery() {
  return apiClient.get<RecoveryResponse>("/recovery").then((r) => r.data);
}

export function upsertRecovery(input: UpsertRecoveryInput) {
  return apiClient.put<RecoveryLogItem>("/recovery", input).then((r) => r.data);
}

/** Honest 0-100 readiness from the user's own RecoveryLog; `score` is null (+ `reason`) without enough real data. */
export function fetchReadiness() {
  return apiClient.get<ReadinessResponse>("/recovery/readiness").then((r) => r.data);
}
