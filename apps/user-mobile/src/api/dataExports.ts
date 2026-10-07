import type { UserDataExportMeta } from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Profile & Settings 16 - "Download my data" (POST/GET /users/me/exports).

export function fetchLatestExport() {
  return apiClient.get<{ export: UserDataExportMeta | null }>("/users/me/exports/latest").then((r) => r.data.export);
}

export function requestExport() {
  return apiClient.post<UserDataExportMeta>("/users/me/exports").then((r) => r.data);
}

/** The raw ZIP bytes (auth header attached by the shared client). */
export function downloadExportBytes(id: string) {
  return apiClient.get<ArrayBuffer>(`/users/me/exports/${id}/download`, { responseType: "arraybuffer" }).then((r) => r.data);
}
