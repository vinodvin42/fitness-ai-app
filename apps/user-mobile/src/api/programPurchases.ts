import type { MyProgram, ProgramProgressDetail, ProgramPurchase } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchMyPrograms() {
  return apiClient.get<{ items: MyProgram[] }>("/programs/mine").then((r) => r.data.items);
}

/**
 * Direct, unpaid purchase — kept only because the endpoint itself still
 * exists for free programs' edge cases; no screen calls this anymore.
 * 20 Aug 2026: the server now 402s this for any priced program without a
 * verified Razorpay payment (gap §14) — ProgramDetailScreen.tsx and
 * WorkoutDetailScreen.tsx both go through useRazorpayPurchase +
 * src/api/payments.ts's createRazorpayOrder/verifyRazorpayPayment instead.
 */
export function purchaseProgram(programId: string) {
  return apiClient.post<ProgramPurchase>(`/programs/${programId}/purchase`).then((r) => r.data);
}

export function fetchProgramProgress(programId: string) {
  return apiClient.get<ProgramProgressDetail>(`/programs/${programId}/progress`).then((r) => r.data);
}
