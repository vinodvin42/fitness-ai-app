import type {
  ConnectedDevice,
  ConnectedDevicesResponse,
  DeviceSyncInput,
  DeviceSyncResult,
  DeviceSyncStatus,
  PairDeviceInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchDevices() {
  return apiClient.get<ConnectedDevicesResponse>("/devices").then((r) => r.data.items);
}

export function fetchDeviceSyncStatus() {
  return apiClient.get<DeviceSyncStatus>("/devices/sync-status").then((r) => r.data.items);
}

export function pairDevice(input: PairDeviceInput) {
  return apiClient.post<ConnectedDevice>("/devices", input).then((r) => r.data);
}

export function removeDevice(id: string) {
  return apiClient.delete(`/devices/${id}`).then(() => undefined);
}

export function syncDevice(id: string, input: DeviceSyncInput) {
  return apiClient.post<DeviceSyncResult>(`/devices/${id}/sync`, input).then((r) => r.data);
}
