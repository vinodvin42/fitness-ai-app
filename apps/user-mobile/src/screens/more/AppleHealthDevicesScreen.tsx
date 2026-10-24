import React from "react";
import { Alert, Platform, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConnectedDevice, ConnectedDeviceStatus, DevicePermission, HealthProvider } from "@fitness-ai-app/types";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { SkeletonCard } from "../../components/Skeleton";
import { connectHealthProvider, fetchHealthConnections, revokeHealthConnection } from "../../api/healthConnections";
import { fetchDevices, updateDevicePermissions } from "../../api/devices";
import { extractErrorMessage } from "../../lib/apiError";
import { PROVIDER_LABEL, timeAgo } from "../../lib/format";
import { HEALTH_CONNECT_RECORDS, openHealthConnectInstall, openHealthConnectSettings, type HealthConnectStatus } from "../../lib/healthConnect";
import { useHealthConnect } from "../../lib/useHealthConnect";
import { useToast } from "../../components/Toast";
import { colors, fonts, radius, spacing, typography, themed } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader, OutlineButton, RowGroup, ToggleRow } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "AppleHealthDevices">;

const STATUS: Record<ConnectedDeviceStatus, { label: string; color: string }> = themed(() => ({
  paired: { label: "Connected", color: colors.successText },
  syncing: { label: "Syncing", color: colors.accentText },
  error: { label: "Sync error", color: colors.dangerText },
  disconnected: { label: "Disconnected", color: colors.textMuted },
}));

const HEALTH_SCOPES = ["heart_rate", "sleep", "activity", "hrv"];

const PERMISSION_ROWS: Array<{ title: string; subtitle: string; perms: DevicePermission[] }> = [
  { title: "Heart Rate", subtitle: "Heart rate during workouts and at rest", perms: ["heart_rate"] },
  { title: "Sleep Tracking", subtitle: "Sleep duration and stages", perms: ["sleep"] },
  { title: "Daily Activity", subtitle: "Steps and active workouts", perms: ["steps", "workouts"] },
];

function DeviceSummary({ device }: { device: ConnectedDevice }) {
  const { colors: theme } = useTheme();
  const st = STATUS[device.status];
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="watch" size={20} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 14 }}>{device.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.color }} />
            <Text style={{ color: st.color, ...typography.meta, fontSize: 13 }}>
              {st.label} · {device.lastSyncAt ? `Synced ${timeAgo(device.lastSyncAt)}` : "Never synced"}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Battery Level</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="battery" size={14} color={colors.success} />
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
            {device.batteryPct == null ? "Not reported" : `${device.batteryPct}%`}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** The Health Connect row's subtitle for each state (Android). */
function healthConnectLine(status: HealthConnectStatus | undefined, granted: number): string {
  if (status === undefined) return "Checking Health Connect…";
  if (status === "unavailable") return "Health Connect isn't available on this phone (it needs Android 9 or newer)";
  if (status === "update_required") return "Install or update Health Connect from the Play Store first";
  if (status === "unsupported") return "Health Connect is only on Android";
  if (granted > 0) return `Reading ${granted} of ${HEALTH_CONNECT_RECORDS.length} data types from Health Connect`;
  return "Read steps, sleep, heart rate, blood oxygen and weight from your phone";
}

/**
 * Apple Health & devices (Figma Profile & Settings 08). Restyles Connected
 * Devices and Health Connect into the frame. The first toggle is the platform's
 * health connection. On Android it is Health Connect itself (lib/useHealthConnect):
 * turning it on opens Health Connect's permission sheet, records consent, pairs
 * the "Health Connect" device and syncs; turning it off withdraws both. On
 * iPhone and web there is no health SDK in this build, so the Apple Health
 * toggle only records consent (/health-connections) and the screen says that
 * reading from the phone is Android-only. Heart rate, sleep and daily activity
 * map to each device's permissions (PATCH /devices/:id), so they need at least
 * one device.
 */
export function AppleHealthDevicesScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const android = Platform.OS === "android";
  const provider: HealthProvider = android ? "health_connect" : "apple_health";
  const providerName = PROVIDER_LABEL[provider];
  const hc = useHealthConnect();

  const devicesQ = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });
  const connectionsQ = useQuery({ queryKey: ["health-connections"], queryFn: fetchHealthConnections });

  const devices = devicesQ.data ?? [];
  const connection = (connectionsQ.data ?? []).find((c) => c.provider === provider && c.status === "connected");

  // iPhone / web: consent only.
  const providerToggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) return connectHealthProvider({ provider, scopes: HEALTH_SCOPES });
      if (connection) return revokeHealthConnection(connection.id);
      return undefined;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["health-connections"] }),
    onError: (err) => Alert.alert(`Couldn't update ${providerName}`, extractErrorMessage(err, "Check your connection and try again.")),
  });

  const healthConnectFailed = (title: string) => (err: unknown) =>
    Alert.alert(title, extractErrorMessage(err, "Check your connection and Health Connect permissions, then try again."));

  const connectHealthConnect = () =>
    hc.connect.mutate(undefined, {
      onSuccess: ({ allowed, days }) => {
        if (allowed.length === 0) {
          Alert.alert("Nothing shared", "Health Connect didn't give Fynrox access to any data. You can allow it in Health Connect at any time.");
          return;
        }
        toast.show(days > 0 ? `Synced ${days} day${days === 1 ? "" : "s"} from Health Connect` : "Connected · no readings yet", "success");
      },
      onError: healthConnectFailed("Couldn't connect Health Connect"),
    });

  const disconnectHealthConnect = () =>
    Alert.alert("Disconnect Health Connect?", "Fynrox stops reading new data. Readings already synced stay in your history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => hc.disconnect.mutate(undefined, { onError: healthConnectFailed("Couldn't disconnect Health Connect") }),
      },
    ]);

  const syncNow = () =>
    hc.sync.mutate(undefined, {
      onSuccess: ({ days }) => toast.show(days > 0 ? `Synced ${days} day${days === 1 ? "" : "s"}` : "Up to date · no new readings", "success"),
      onError: healthConnectFailed("Couldn't sync Health Connect"),
    });

  const permissionToggle = useMutation({
    mutationFn: async ({ perms, on }: { perms: DevicePermission[]; on: boolean }) => {
      await Promise.all(
        devices.map((d) => {
          const set = new Set<DevicePermission>(d.permissions);
          for (const p of perms) {
            if (on) set.add(p);
            else set.delete(p);
          }
          return updateDevicePermissions(d.id, [...set]);
        }),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
    onError: (err) => Alert.alert("Couldn't update permissions", extractErrorMessage(err, "Check your connection and try again.")),
  });

  const hasDevices = devices.length > 0;
  const allowed = (perms: DevicePermission[]) => hasDevices && devices.every((d) => perms.every((p) => d.permissions.includes(p)));
  const openRecover = (screen: "AddDevice" | "ConnectedDevices") => navigation.getParent()?.navigate("Recover", { screen, initial: false });
  const hcBusy = hc.connect.isPending || hc.disconnect.isPending;

  return (
    <RecoverShell centered title={`${providerName} & devices`} onBack={() => navigation.goBack()}>
      {devicesQ.isLoading ? (
        <SkeletonCard lines={3} />
      ) : devicesQ.isError ? (
        <ErrorState message="Couldn't load your devices." onRetry={() => devicesQ.refetch()} />
      ) : hasDevices ? (
        devices.map((d) => <DeviceSummary key={d.id} device={d} />)
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>No device connected</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            {android
              ? "Connect Health Connect below to bring in what your watch, band or scale records, or add a device."
              : "Add a watch, band or scale to record its sync history here."}
          </Text>
        </View>
      )}

      <GroupHeader>Health Permissions</GroupHeader>
      <RowGroup>
        {android ? (
          <ToggleRow
            icon="heart-pulse"
            title={providerName}
            subtitle={healthConnectLine(hc.status, hc.granted.length)}
            value={hc.connected}
            disabled={hc.checking || hc.status !== "available" || hcBusy}
            onValueChange={(v) => (v ? connectHealthConnect() : disconnectHealthConnect())}
          />
        ) : (
          <ToggleRow
            icon="heart-pulse"
            title={providerName}
            subtitle="Records your consent to read workouts and health data"
            value={!!connection}
            disabled={connectionsQ.isLoading || providerToggle.isPending}
            onValueChange={(v) => providerToggle.mutate(v)}
          />
        )}
        {PERMISSION_ROWS.map((r) => (
          <ToggleRow
            key={r.title}
            title={r.title}
            subtitle={hasDevices ? r.subtitle : "Add a device to manage this"}
            value={allowed(r.perms)}
            disabled={!hasDevices || permissionToggle.isPending}
            onValueChange={(v) => permissionToggle.mutate({ perms: r.perms, on: v })}
          />
        ))}
      </RowGroup>

      {android && hc.status === "update_required" ? (
        <OutlineButton icon="download" label="Get Health Connect" onPress={() => void openHealthConnectInstall()} />
      ) : null}
      {android && hc.connected ? (
        <>
          <OutlineButton icon="refresh-cw" label={hc.sync.isPending ? "Syncing…" : "Sync now"} disabled={hc.sync.isPending || hcBusy} onPress={syncNow} />
          <OutlineButton icon="settings" label="Manage in Health Connect" onPress={openHealthConnectSettings} />
        </>
      ) : null}
      <OutlineButton label="+ Add New Device" onPress={() => openRecover("AddDevice")} />
      {hasDevices ? <OutlineButton label="Devices & sync history" onPress={() => openRecover("ConnectedDevices")} /> : null}
      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
        {android
          ? "Fynrox reads Health Connect when you open the app (at most every 3 hours) and when you tap Sync now. Change what it may read in Health Connect at any time."
          : "Reading health data from your phone is Android-only (Health Connect). Here, readings are recorded when a device syncs."}
      </Text>
    </RecoverShell>
  );
}
