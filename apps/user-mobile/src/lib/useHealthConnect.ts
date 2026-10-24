import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { connectHealthProvider, fetchHealthConnections, revokeHealthConnection } from "../api/healthConnections";
import { fetchDevices } from "../api/devices";
import {
  findHealthConnectDevice,
  getGrantedHealthConnectRecords,
  getHealthConnectStatus,
  requestHealthConnectPermissions,
  revokeHealthConnectPermissions,
  syncHealthConnect,
  type HealthConnectRecord,
} from "./healthConnect";

/**
 * Screen-side Health Connect state for Connected devices (Profile › Connected
 * devices) and Settings › Health Connect. "Connect" opens Health Connect's
 * permission sheet, records the member's consent (POST /health-connections,
 * with the record types they allowed), pairs the "Health Connect" device and
 * syncs. "Disconnect" withdraws the Health Connect permissions and the consent;
 * the device and its sync history stay until the member removes them.
 */
export const HC_STATUS_KEY = ["health-connect", "status"] as const;
export const HC_GRANTED_KEY = ["health-connect", "granted"] as const;

export function refreshAfterHealthSync(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["devices"] }),
    qc.invalidateQueries({ queryKey: ["health-connections"] }),
    qc.invalidateQueries({ queryKey: ["recovery"] }),
    qc.invalidateQueries({ queryKey: ["readiness"] }),
    qc.invalidateQueries({ queryKey: HC_GRANTED_KEY }),
  ]);
}

export function useHealthConnect() {
  const qc = useQueryClient();
  const android = Platform.OS === "android";
  const status = useQuery({ queryKey: HC_STATUS_KEY, queryFn: getHealthConnectStatus, enabled: android, staleTime: 60_000 });
  const available = status.data === "available";
  const granted = useQuery({ queryKey: HC_GRANTED_KEY, queryFn: getGrantedHealthConnectRecords, enabled: available });
  const connections = useQuery({ queryKey: ["health-connections"], queryFn: fetchHealthConnections, enabled: android });
  const consent = (connections.data ?? []).find((c) => c.provider === "health_connect" && c.status === "connected");

  // Back from the Play Store or Health Connect's own settings: status and permissions may have changed.
  useEffect(() => {
    if (!android) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void qc.invalidateQueries({ queryKey: ["health-connect"] });
    });
    return () => sub.remove();
  }, [android, qc]);

  const connect = useMutation({
    mutationFn: async () => {
      const allowed = await requestHealthConnectPermissions();
      qc.setQueryData<HealthConnectRecord[]>(HC_GRANTED_KEY, allowed);
      if (allowed.length === 0) return { allowed, days: 0 };
      await connectHealthProvider({ provider: "health_connect", scopes: allowed });
      const { days } = await syncHealthConnect();
      return { allowed, days };
    },
    onSettled: () => refreshAfterHealthSync(qc),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      await revokeHealthConnectPermissions().catch(() => undefined);
      if (consent) await revokeHealthConnection(consent.id);
      qc.setQueryData<HealthConnectRecord[]>(HC_GRANTED_KEY, []);
    },
    onSettled: () => refreshAfterHealthSync(qc),
  });

  const sync = useMutation({
    mutationFn: () => syncHealthConnect(),
    onSettled: () => refreshAfterHealthSync(qc),
  });

  return {
    android,
    /** undefined while checking on Android. */
    status: android ? status.data : ("unsupported" as const),
    granted: granted.data ?? [],
    connected: available && (granted.data?.length ?? 0) > 0,
    checking: android && (status.isLoading || (available && granted.isLoading)),
    recheck: () => Promise.all([qc.invalidateQueries({ queryKey: HC_STATUS_KEY }), qc.invalidateQueries({ queryKey: HC_GRANTED_KEY })]),
    connect,
    disconnect,
    sync,
  };
}

// ---- Background refresh -----------------------------------------------------

const LAST_AUTO_SYNC_KEY = "fynrox.healthConnect.lastAutoSync";
export const AUTO_SYNC_EVERY_MS = 3 * 60 * 60 * 1000;

/** Pure gate for tests: due when never synced, or the last attempt is older than the interval (or in the future). */
export function autoSyncDue(lastAttemptMs: number | null, nowMs: number, everyMs = AUTO_SYNC_EVERY_MS): boolean {
  if (lastAttemptMs == null || !Number.isFinite(lastAttemptMs)) return true;
  return nowMs - lastAttemptMs >= everyMs || lastAttemptMs > nowMs;
}

let autoSyncRunning = false;
async function autoSync(qc: QueryClient): Promise<void> {
  if (autoSyncRunning) return;
  autoSyncRunning = true;
  try {
    const last = Number(await AsyncStorage.getItem(LAST_AUTO_SYNC_KEY).catch(() => null)) || null;
    if (!autoSyncDue(last, Date.now())) return;
    if ((await getGrantedHealthConnectRecords().catch(() => [])).length === 0) return;
    // Only refresh a device the member connected; never pair one silently.
    if (!findHealthConnectDevice(await fetchDevices())) return;
    await AsyncStorage.setItem(LAST_AUTO_SYNC_KEY, String(Date.now())).catch(() => undefined);
    await syncHealthConnect();
    await refreshAfterHealthSync(qc);
  } catch {
    // Best-effort; the device shows the error from syncHealthConnect, and the next attempt waits the interval.
  } finally {
    autoSyncRunning = false;
  }
}

/**
 * Mounted once while signed in: syncs Health Connect when the app opens or
 * comes back to the foreground, at most every 3 hours, and only after the
 * member connected it. Android only.
 */
export function useHealthConnectAutoSync(signedIn: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (Platform.OS !== "android" || !signedIn) return;
    void autoSync(qc);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void autoSync(qc);
    });
    return () => sub.remove();
  }, [signedIn, qc]);
}
