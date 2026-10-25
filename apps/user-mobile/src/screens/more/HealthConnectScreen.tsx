import React, { useState } from "react";
import { Alert, Platform, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HealthConnection, HealthProvider } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { Icon } from "../../components/Icon";
import { BottomSheet } from "../../components/BottomSheet";
import { InfoCard } from "../../components/StatePanels";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { connectHealthProvider, fetchHealthConnections, revokeHealthConnection } from "../../api/healthConnections";
import { extractErrorMessage } from "../../lib/apiError";
import { PROVIDER_LABEL } from "../../lib/format";
import { HEALTH_CONNECT_RECORD_LABEL, openHealthConnectInstall, openHealthConnectSettings } from "../../lib/healthConnect";
import { useHealthConnect } from "../../lib/useHealthConnect";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "HealthConnect">;

const SCOPES: Array<{ key: string; label: string; hint: string }> = [
  { key: "heart_rate", label: "Heart rate", hint: "Resting heart rate and ranges" },
  { key: "sleep", label: "Sleep", hint: "Sleep duration" },
  { key: "activity", label: "Daily activity", hint: "Steps and calories burned" },
  { key: "hrv", label: "How rested your body is", hint: "Heart-rate variability (HRV), if your watch measures it" },
];

interface ProviderDef {
  provider: HealthProvider;
  /** Where an in-app connection can be recorded today. */
  available: boolean;
  blurb: string;
}

function providerDefs(): ProviderDef[] {
  const ios = Platform.OS !== "android";
  const android = Platform.OS !== "ios";
  return [
    { provider: "apple_health", available: ios, blurb: ios ? "iPhone and Apple Watch data" : "Only on iPhone" },
    { provider: "health_connect", available: android, blurb: android ? "Android and Wear OS data" : "Only on Android" },
    { provider: "garmin", available: false, blurb: "Coming soon" },
    { provider: "fitbit", available: false, blurb: "Coming soon" },
    { provider: "whoop", available: false, blurb: "Coming soon" },
    { provider: "oura", available: false, blurb: "Coming soon" },
  ];
}

/**
 * Android's Health Connect card: the real connection (lib/useHealthConnect).
 * Health Connect's own sheet picks the data types, so there's no scope sheet.
 */
function HealthConnectCard() {
  const toast = useToast();
  const hc = useHealthConnect();
  const failed = (fallback: string) => (err: unknown) => toast.show(extractErrorMessage(err, fallback), "error");
  const blurb =
    hc.status === undefined
      ? "Checking Health Connect…"
      : hc.status === "available"
        ? hc.connected
          ? `Reading: ${hc.granted.map((r) => HEALTH_CONNECT_RECORD_LABEL[r]).join(", ")}`
          : "Android and Wear OS data: steps, sleep, heart rate, blood oxygen, weight"
        : hc.status === "update_required"
          ? "Install or update Health Connect from the Play Store first"
          : "Health Connect isn't available on this phone";
  const confirmDisconnect = () =>
    Alert.alert("Disconnect Health Connect?", "Fynrox stops reading new data. Readings already synced stay in your history.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => hc.disconnect.mutate(undefined, { onError: failed("Couldn't disconnect.") }) },
    ]);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Icon name="heart-pulse" size={22} color={hc.connected ? colors.success : colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{PROVIDER_LABEL.health_connect}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{blurb}</Text>
        </View>
        {hc.connected ? <Pill label="Connected" tone="success" /> : null}
      </View>
      {hc.connected ? (
        <>
          <Button
            label="Sync now"
            loading={hc.sync.isPending}
            onPress={() =>
              hc.sync.mutate(undefined, {
                onSuccess: ({ days }) => toast.show(days > 0 ? `Synced ${days} day${days === 1 ? "" : "s"}` : "Up to date", "success"),
                onError: failed("Couldn't sync Health Connect."),
              })
            }
          />
          <Button label="Manage in Health Connect" variant="secondary" onPress={openHealthConnectSettings} />
          <Button label="Disconnect" variant="secondary" loading={hc.disconnect.isPending} onPress={confirmDisconnect} />
        </>
      ) : hc.status === "update_required" ? (
        <Button label="Get Health Connect" onPress={() => void openHealthConnectInstall()} />
      ) : hc.status === "available" ? (
        <Button
          label="Connect"
          loading={hc.connect.isPending}
          onPress={() =>
            hc.connect.mutate(undefined, {
              onSuccess: ({ allowed, days }) =>
                allowed.length === 0
                  ? toast.show("Health Connect didn't share any data with Fynrox.", "error")
                  : toast.show(days > 0 ? `Synced ${days} day${days === 1 ? "" : "s"} from Health Connect` : "Connected", "success"),
              onError: failed("Couldn't connect Health Connect."),
            })
          }
        />
      ) : null}
    </Card>
  );
}

/**
 * Settings 08 - Health Connect. On Android, Health Connect is a real
 * connection (HealthConnectCard): Fynrox reads it and syncs the readings.
 * Other sources have no SDK in this build, so "Connect" only records the
 * user's consent and the data types they allow (POST /health-connections);
 * "Revoke" withdraws it (DELETE). Their readings arrive only when a device syncs.
 */
export function HealthConnectScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["health-connections"],
    queryFn: fetchHealthConnections,
  });
  const [connecting, setConnecting] = useState<HealthProvider | null>(null);
  const [scopes, setScopes] = useState<string[]>(SCOPES.map((s) => s.key));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["health-connections"] });

  const connect = useMutation({
    mutationFn: (provider: HealthProvider) => connectHealthProvider({ provider, scopes }),
    onSuccess: () => {
      refresh();
      setConnecting(null);
      toast.show("Consent recorded", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't save your connection."), "error"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeHealthConnection(id),
    onSuccess: () => {
      refresh();
      toast.show("Access revoked", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't revoke access."), "error"),
  });

  const byProvider = new Map<HealthProvider, HealthConnection>();
  for (const c of data ?? []) byProvider.set(c.provider, c);

  const openConnect = (provider: HealthProvider) => {
    setScopes(SCOPES.map((s) => s.key));
    setConnecting(provider);
  };

  const confirmRevoke = (c: HealthConnection) =>
    Alert.alert("Revoke access?", `${PROVIDER_LABEL[c.provider]} will no longer be recorded as connected.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => revoke.mutate(c.id) },
    ]);

  return (
    <ScreenContainer title="Health Connect" subtitle="Choose what Fynrox may read" onBack={() => navigation.goBack()}>
      <InfoCard
        tone="accent"
        title={Platform.OS === "android" ? "Bring in your watch's data" : "This saves your permission"}
        body={
          Platform.OS === "android"
            ? "Health Connect holds what your watch, band, ring or scale records. Connect it and choose what Fynrox may read; Fynrox syncs it when you open the app."
            : "Connecting here saves your permission and the kinds of data you allow. Reading data from your phone is Android-only (Health Connect); here, readings come in when your device syncs (see Recovery > Connected devices)."
        }
      />

      {Platform.OS === "android" ? <HealthConnectCard /> : null}

      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load your health connections." onRetry={() => refetch()} />
      ) : (
        // Only sources that can be connected on this phone (or already are).
        // Garmin, Fitbit, Whoop and Oura aren't supported yet, and a list
        // of greyed-out "Coming soon" rows is just clutter.
        providerDefs()
          .filter((def) => !(Platform.OS === "android" && def.provider === "health_connect"))
          .filter((def) => def.available || byProvider.get(def.provider)?.status === "connected")
          .map((def) => {
            const conn = byProvider.get(def.provider);
            const active = conn?.status === "connected";
            return (
              <Card key={def.provider} style={{ gap: spacing.sm, opacity: def.available || active ? 1 : 0.6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Icon name="heart-pulse" size={22} color={active ? colors.success : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{PROVIDER_LABEL[def.provider]}</Text>
                    <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                      {active
                        ? `Allowed: ${conn.scopes.length ? conn.scopes.join(", ").replace(/_/g, " ") : "no data types"}`
                        : def.blurb}
                    </Text>
                  </View>
                  {active ? (
                    <Pill label="Connected" tone="success" />
                  ) : !def.available ? (
                    <Pill label="Coming soon" />
                  ) : null}
                </View>
                {active ? (
                  <Button
                    label="Revoke access"
                    variant="secondary"
                    loading={revoke.isPending && revoke.variables === conn.id}
                    onPress={() => confirmRevoke(conn)}
                  />
                ) : def.available ? (
                  <Button label={conn ? "Reconnect" : "Connect"} onPress={() => openConnect(def.provider)} />
                ) : null}
              </Card>
            );
          })
      )}

      <Button label="Connected devices" variant="secondary" onPress={() => navigation.getParent()?.navigate("Recover", { screen: "ConnectedDevices", initial: false })} />

      <BottomSheet
        visible={connecting != null}
        onClose={() => setConnecting(null)}
        title={connecting ? `Connect ${PROVIDER_LABEL[connecting]}` : "Connect"}
      >
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          Pick the data types you're happy to share. You can revoke this any time.
        </Text>
        {SCOPES.map((s) => (
          <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{s.label}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>{s.hint}</Text>
            </View>
            <Switch
              value={scopes.includes(s.key)}
              onValueChange={(v) => setScopes((prev) => (v ? [...prev, s.key] : prev.filter((k) => k !== s.key)))}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={s.label}
            />
          </View>
        ))}
        <Button
          label="Record my consent"
          loading={connect.isPending}
          disabled={scopes.length === 0}
          onPress={() => connecting && connect.mutate(connecting)}
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
