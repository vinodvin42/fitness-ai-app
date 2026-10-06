import React, { useState } from "react";
import { Alert, Platform, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HealthConnection, HealthProvider } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
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
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "HealthConnect">;

const SCOPES: Array<{ key: string; label: string; hint: string }> = [
  { key: "heart_rate", label: "Heart rate", hint: "Resting HR and ranges" },
  { key: "sleep", label: "Sleep", hint: "Sleep duration" },
  { key: "activity", label: "Daily activity", hint: "Steps and active energy" },
  { key: "hrv", label: "HRV", hint: "Heart-rate variability" },
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
 * Settings 08 - Health Connect. Honest scope: this build has no HealthKit /
 * Health Connect SDK, so "Connect" only records the user's consent and the
 * data types they allow (POST /health-connections); "Revoke" withdraws it
 * (DELETE). Readings are imported only when a device syncs.
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
    <ScreenContainer title="Health Connect" subtitle="Choose what 23PrimeFit may read">
      <BackButton onPress={() => navigation.goBack()} />
      <InfoCard
        tone="accent"
        title="Consent only, for now"
        body="Connecting here records your permission and the data types you allow. This build has no native health SDK, so data is imported only when a device syncs (see Recover > Connected devices)."
      />

      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load your health connections." onRetry={() => refetch()} />
      ) : (
        providerDefs().map((def) => {
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

      <Button label="Connected devices" variant="secondary" onPress={() => navigation.getParent()?.navigate("Recover", { screen: "ConnectedDevices" })} />

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
