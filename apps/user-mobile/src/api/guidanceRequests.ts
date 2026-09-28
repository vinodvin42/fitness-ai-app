import { apiClient } from "./client";

/**
 * "Request professional guidance" — the controlled-assignment entry
 * point (handoff §2 decision #4). The user asks for help; an admin
 * matches a professional (A-M1). No browsing, no per-session prices.
 */
export type GuidanceRequestStatus = "open" | "offered" | "fulfilled" | "cancelled" | "exhausted";

export type GuidanceRequest = {
  id: string;
  serviceType: "fitness" | "nutrition";
  status: GuidanceRequestStatus;
  userNote: string | null;
  rematchCount: number;
  closedReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function createGuidanceRequest(input: { serviceType: "fitness" | "nutrition"; userNote?: string }) {
  return apiClient.post<GuidanceRequest>("/coaching/guidance-requests", input).then((r) => r.data);
}

export function fetchMyGuidanceRequests() {
  return apiClient.get<GuidanceRequest[]>("/coaching/guidance-requests").then((r) => r.data);
}

export function cancelGuidanceRequest(id: string) {
  return apiClient.post<GuidanceRequest>(`/coaching/guidance-requests/${id}/cancel`).then((r) => r.data);
}
