import type { ProfessionalDataSharing, UpdateProfessionalDataSharingInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Profile & Settings 12 - per-professional data sharing.

export function fetchSharing() {
  return apiClient.get<{ items: ProfessionalDataSharing[] }>("/coaching/sharing").then((r) => r.data.items);
}

export function updateSharing(professionalId: string, input: UpdateProfessionalDataSharingInput) {
  return apiClient
    .patch<ProfessionalDataSharing>(`/coaching/professionals/${professionalId}/sharing`, input)
    .then((r) => r.data);
}
