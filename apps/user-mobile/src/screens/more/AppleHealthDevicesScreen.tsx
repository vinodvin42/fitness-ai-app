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
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader, OutlineButton, RowGroup, ToggleRow } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "AppleHealthDevices">;

const STATUS: Record<ConnectedDeviceStatus, { label: string; color: string }> = {
  paired: { label: "Connected", color: colors.success },
  syncing: { label: "Syncing", color: colors.accent },
  error: { label: "Sync error", color: colors.danger },
  disconnected: { label: "Disconnected", color: colors.textMuted },
};

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
            <Text style={{ color: st.color, ...typography.meta, fontSize: 11 }}>
              {st.label} · {device.lastSyncAt ? `Synced ${timeAgo(device.lastSyncAt)}` : "Never synced"}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Battery Level</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="battery" size={14} color={colors.success} />
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
            {device.batteryPct == null ? "Not reported" : `${device.batteryPct}%`}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Apple Health & devices (Figma Profile & Settings 08). Restyles Connected
 * Devices and Health Connect into the frame. The first toggle is the platform's
 * health connection (Apple Health on iPhone/web, Health Connect on Android):
 * it records or withdraws consent via /health-connections. Heart rate, sleep
 * and daily activity map to each device's permissions (PATCH /devices/:id), so
 * they need at least one device. This build has no native health SDK, so data
 * arrives only when a device syncs.
 */
export function AppleHealthDevicesScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const provider: HealthProvider = Platform.OS === "android" ? "health_connect" : "apple_health";
  const providerName = PROVIDER_LABEL[provider];

  const devicesQ = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });
  const connectionsQ = useQuery({ queryKey: ["health-connections"], queryFn: fetchHealthConnections });

  const devices = devicesQ.data ?? [];
  const connection = (connectionsQ.data ?? []).find((c) => c.provider === provider && c.status === "connected");

  const providerToggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) return connectHealthProvider({ provider, scopes: HEALTH_SCOPES });
      if (connection) return revokeHealthConnection(connection.id);
      return undefined;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["health-connections"] }),
    onError: (err) => Alert.alert(`Couldn't update ${providerName}`, extractErrorMessage(err, "Check your connection and try again.")),
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
  const openRecover = (screen: "AddDevice" | "ConnectedDevices") => navigation.getParent()?.navigate("Recover", { screen });

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
            Add a watch, band or scale to record its sync history here.
          </Text>
        </View>
      )}

      <GroupHeader>Health Permissions</GroupHeader>
      <RowGroup>
        <ToggleRow
          icon="heart-pulse"
          title={providerName}
          subtitle="Records your consent to read workouts and health data"
          value={!!connection}
          disabled={connectionsQ.isLoading || providerToggle.isPending}
          onValueChange={(v) => providerToggle.mutate(v)}
        />
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

      <OutlineButton label="+ Add New Device" onPress={() => openRecover("AddDevice")} />
      {hasDevices ? <OutlineButton label="Devices & sync history" onPress={() => openRecover("ConnectedDevices")} /> : null}
      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
        This build has no native health SDK, so readings are recorded when a device syncs.
      </Text>
    </RecoverShell>
  );
}
