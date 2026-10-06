import React from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConnectedDevice, ConnectedDeviceKind, ConnectedDeviceStatus, DevicePermission } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchDevices } from "../../api/devices";
import { PROVIDER_LABEL, timeAgo } from "../../lib/format";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { CircleButton, RecoverShell, SectionLabel } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "ConnectedDevices">;

const STATUS: Record<ConnectedDeviceStatus, { label: string; color: string }> = {
  paired: { label: "Connected", color: colors.success },
  syncing: { label: "Syncing", color: colors.accent },
  error: { label: "Sync error", color: colors.danger },
  disconnected: { label: "Disconnected", color: colors.textMuted },
};

const KIND_ICON: Record<ConnectedDeviceKind, IconName> = {
  watch: "watch",
  band: "smartphone",
  ring: "activity",
  scale: "scale",
  other: "cloud",
};
const KIND_LABEL: Record<ConnectedDeviceKind, string> = {
  watch: "Smartwatch",
  band: "Fitness band",
  ring: "Smart ring",
  scale: "Smart scale",
  other: "Device",
};

/** One device card. Used by Connected Devices (and the sync status dots elsewhere). */
export function DeviceCard({ device, onSync }: { device: ConnectedDevice; onSync: () => void }) {
  const st = STATUS[device.status];
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md - 2 }}>
      <View
        style={{
          width: 44,
          height: 52,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceRaised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={KIND_ICON[device.kind]} size={22} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>{device.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.color }} />
            <Text style={{ color: st.color, ...typography.meta, fontSize: 11 }}>{st.label}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          {KIND_LABEL[device.kind]} · {PROVIDER_LABEL[device.provider] ?? device.provider}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="battery" size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>
              {device.batteryPct == null ? "Not reported" : `${device.batteryPct}%`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
            <Icon name="refresh-cw" size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }} numberOfLines={1}>
              {device.lastSyncAt ? `Synced ${timeAgo(device.lastSyncAt)}` : "Never synced"}
            </Text>
          </View>
        </View>
        {device.lastError ? (
          <Text style={{ color: colors.danger, ...typography.meta, fontSize: 11 }}>Last error: {device.lastError}</Text>
        ) : null}
      </View>
      <CircleButton icon="refresh-cw" onPress={onSync} label={`Sync ${device.name}`} tint={colors.accent} />
    </Card>
  );
}

const PLATFORMS: Array<{ name: string; blurb: string; icon: IconName; tint: string }> = [
  { name: "Apple Health", blurb: "Sync workouts & health metrics...", icon: "heart-pulse", tint: colors.warning },
  { name: "Samsung Health", blurb: "Import sleep and body composition...", icon: "activity", tint: colors.warning },
  { name: "Strava", blurb: "Automate run, ride, and swim routes...", icon: "compass", tint: colors.warning },
];

const SYNC_CHIPS: Array<{ label: string; perm: DevicePermission }> = [
  { label: "Steps", perm: "steps" },
  { label: "Heart Rate", perm: "heart_rate" },
  { label: "Sleep", perm: "sleep" },
  { label: "SpO2", perm: "spo2" },
];

/** Recover 02 - Connected Devices. */
export function ConnectedDevicesScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });
  const devices = data ?? [];
  const allowed = new Set(devices.flatMap((d) => d.permissions));

  const openHealthConnect = () => navigation.getParent()?.navigate("More", { screen: "HealthConnect" });

  return (
    <RecoverShell
      centered
      title="Connected Devices"
      onBack={() => navigation.goBack()}
      right={<CircleButton icon="plus" onPress={() => navigation.navigate("AddDevice")} label="Add device" tint={colors.accent} />}
    >
      <SectionLabel small>Data Sync Status</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {SYNC_CHIPS.map((c) => {
          const on = allowed.has(c.perm);
          return (
            <View
              key={c.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: colors.surfaceRaised,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: on ? colors.textPrimary : colors.textMuted, ...typography.label }}>{c.label}</Text>
              {on ? <Icon name="check" size={13} color={colors.success} strokeWidth={3} /> : null}
            </View>
          );
        })}
      </View>

      <SectionLabel small>Active Devices</SectionLabel>
      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load your devices." onRetry={() => refetch()} />
      ) : devices.length === 0 ? (
        <EmptyState
          title="No devices yet"
          subtitle="Add a device to record its sync history here. Nothing is shown until you add one."
          actionLabel="Add device"
          onAction={() => navigation.navigate("AddDevice")}
        />
      ) : (
        devices.map((d) => (
          <Pressable key={d.id} onPress={() => navigation.navigate("DevicePairing", { provider: d.provider, kind: d.kind, name: d.name, deviceId: d.id })}
            accessibilityRole="button"
          >
            <DeviceCard device={d} onSync={() => navigation.navigate("SyncDashboard", { importDeviceId: d.id })} />
          </Pressable>
        ))
      )}

      <SectionLabel small>Available Platforms</SectionLabel>
      {PLATFORMS.map((p) => (
        <Card key={p.name} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md - 2 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={p.icon} size={20} color={p.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{p.name}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }} numberOfLines={1}>
              {p.blurb}
            </Text>
          </View>
          <Pressable
            onPress={openHealthConnect}
            accessibilityRole="button"
            accessibilityLabel={`Connect ${p.name}`}
            style={{
              borderWidth: 1,
              borderColor: colors.accent,
              borderRadius: radius.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: colors.accent, ...typography.label }}>Connect</Text>
          </Pressable>
        </Card>
      ))}
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        Connect opens the consent screen. This build has no Bluetooth or HealthKit/Health Connect SDK, so values are
        recorded when you import them from a device&apos;s sync button.
      </Text>
    </RecoverShell>
  );
}
