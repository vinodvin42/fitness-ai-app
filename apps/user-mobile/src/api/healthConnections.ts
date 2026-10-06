import type {
  ConnectHealthInput,
  HealthConnection,
  HealthConnectionsResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchHealthConnections() {
  return apiClient.get<HealthConnectionsResponse>("/health-connections").then((r) => r.data.items);
}

export function connectHealthProvider(input: ConnectHealthInput) {
  return apiClient.post<HealthConnection>("/health-connections", input).then((r) => r.data);
}

export function revokeHealthConnection(id: string) {
  return apiClient.delete<HealthConnection>(`/health-connections/${id}`).then((r) => r.data);
}
