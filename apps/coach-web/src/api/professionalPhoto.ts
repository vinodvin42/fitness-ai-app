import type { ProfilePhoto } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/** Profile photo (25 Oct 2026): members see it on your profile. null when none is set. */
export function fetchMyPhoto() {
  return apiClient.get<{ photo: ProfilePhoto | null }>("/professionals/me/photo").then((r) => r.data.photo);
}

export function saveMyPhoto(imageData: string) {
  return apiClient.put<{ photo: ProfilePhoto }>("/professionals/me/photo", { imageData }).then((r) => r.data.photo);
}

export function deleteMyPhoto() {
  return apiClient.delete("/professionals/me/photo");
}
