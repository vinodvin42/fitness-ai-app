import type { ReferralSummary } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchReferralSummary() {
  return apiClient.get<ReferralSummary>("/referrals/me").then((r) => r.data);
}
