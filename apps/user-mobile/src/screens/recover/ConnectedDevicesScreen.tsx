import React from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConnectedDevice, ConnectedDeviceStatus } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchDevices } from "../../api/devices";
import { PROVIDER_LABEL, timeAgo } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "ConnectedDevices">;

const STATUS_PILL: Record<ConnectedDeviceStatus, { label: string; tone: "success" | "accent" | "danger" | "neutral" }> = {
  paired: { label: "Paired", tone: "success" },
  syncing: { label: "Syncing", tone: "accent" },
  error: { label: "Sync error", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "neutral" },
};

export function DeviceRow({ device, onPress }: { device: ConnectedDevice; onPress?: () => void }) {
  const pill = STATUS_PILL[device.status];
  const body = (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceRaised,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="watch" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{device.name}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
            {PROVIDER_LABEL[device.provider] ?? device.provider} · last sync {timeAgo(device.lastSyncAt)}
          </Text>
        </View>
        <Pill label={pill.label} tone={pill.tone} />
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: colors.background,
          borderRadius: radius.sm,
          padding: spacing.sm + 4,
        }}
      >
        <Text style={{ color: colors.textSecondary, ...typography.label }}>Battery</Text>
        <Text style={{ color: colors.textPrimary, ...typography.label }}>
          {device.batteryPct == null ? "Not reported" : `${device.batteryPct}%`}
        </Text>
      </View>
      {device.lastError ? (
        <Text style={{ color: colors.danger, ...typography.meta }}>Last error: {device.lastError}</Text>
      ) : null}
    </Card>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${device.name}, ${pill.label}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Recover 02 - Connected Devices Hub. */
export function ConnectedDevicesScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });

  return (
    <ScreenContainer title="Connected devices" subtitle="Watches, bands, rings & scales">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load your devices." onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No devices yet"
          subtitle="Add a device to record its sync history here. Nothing is shown until you add one."
          actionLabel="Add device"
          onAction={() => navigation.navigate("AddDevice")}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {(data ?? []).map((d) => (
            <DeviceRow key={d.id} device={d} onPress={() => navigation.navigate("SyncDashboard")} />
          ))}
          <Button label="Add device" variant="secondary" onPress={() => navigation.navigate("AddDevice")} />
          <Button label="Sync dashboard" onPress={() => navigation.navigate("SyncDashboard")} />
        </View>
      )}
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        This build has no Bluetooth or HealthKit/Health Connect SDK, so devices can't sync on their own. You can add a
        device record and import values by hand from the Sync dashboard.
      </Text>
    </ScreenContainer>
  );
}
