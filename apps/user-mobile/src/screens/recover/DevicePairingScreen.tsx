import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { DevicePermission } from "@fitness-ai-app/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { fetchDevices, pairDevice, updateDevicePermissions } from "../../api/devices";
import { extractErrorMessage } from "../../lib/apiError";
import { PROVIDER_LABEL } from "../../lib/format";
import { PERMISSION_ROWS } from "../../content/recover";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, RecoverShell, SectionLabel, Toggle } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "DevicePairing">;

const ALL: DevicePermission[] = PERMISSION_ROWS.map((r) => r.key);

function Radar() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ring = (delay: number) => ({
    position: "absolute" as const,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: colors.accent,
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85 + delay, 1.6 + delay] }) }],
  });
  return (
    <View style={{ height: 210, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden>
      <Animated.View style={ring(0)} />
      <Animated.View style={ring(0.25)} />
      <View
        style={{ width: 170, height: 170, borderRadius: 85, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="bluetooth" size={34} color={colors.textOnAccent} />
      </View>
    </View>
  );
}

/**
 * Recover 04 - Pair Device. Real BLE scanning/pairing isn't available in this
 * build, so "pairing" is the user confirming the device and the Data
 * Permissions it may supply; the API records both (POST /devices, then PATCH
 * /devices/:id for later changes). Opened with `deviceId` it edits an
 * existing device's permissions.
 */
export function DevicePairingScreen({ navigation, route }: Props) {
  const { provider, kind, name, deviceId } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: fetchDevices, enabled: !!deviceId });
  const [addedId, setAddedId] = useState<string | null>(deviceId ?? null);
  const [perms, setPerms] = useState<DevicePermission[]>(ALL);
  const hydrated = useRef(false);

  useEffect(() => {
    if (deviceId && devices && !hydrated.current) {
      const d = devices.find((x) => x.id === deviceId);
      if (d) {
        hydrated.current = true;
        setPerms(d.permissions);
      }
    }
  }, [deviceId, devices]);

  const pair = useMutation({
    mutationFn: () => pairDevice({ provider, kind, name, permissions: perms }),
    onSuccess: (d) => {
      setAddedId(d.id);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.show("Device added", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't add this device. Try again."), "error"),
  });

  const savePerms = useMutation({
    mutationFn: (v: { id: string; permissions: DevicePermission[] }) => updateDevicePermissions(v.id, v.permissions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't save permissions."), "error"),
  });

  const toggle = (key: DevicePermission, on: boolean) => {
    const next = on ? Array.from(new Set([...perms, key])) : perms.filter((p) => p !== key);
    setPerms(next);
    if (addedId) savePerms.mutate({ id: addedId, permissions: next });
  };

  return (
    <RecoverShell centered title={deviceId ? "Device" : "Pair Device"} onBack={() => navigation.goBack()}>
      <Radar />
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15 }}>
          {addedId ? "Device added" : "Ready to add this device"}
        </Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
          Bluetooth scanning isn&apos;t available in this build, so nothing is searched for. Confirm below to record this
          device on your account.
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <Icon name="watch" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{name}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>
            via {PROVIDER_LABEL[provider] ?? provider} · {kind}
          </Text>
        </View>
        {addedId ? (
          <Text style={{ color: colors.success, ...typography.label }}>Added</Text>
        ) : (
          <ActionButton
            label={pair.isPending ? "Adding…" : "Add Now"}
            onPress={() => !pair.isPending && pair.mutate()}
            style={{ height: 34, paddingHorizontal: spacing.md }}
          />
        )}
      </View>

      <SectionLabel small>Data Permissions</SectionLabel>
      <View style={{ gap: 2 }}>
        {PERMISSION_ROWS.map((row) => (
          <View
            key={row.key}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2 }}
          >
            <Icon name={row.icon} size={16} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 14, flex: 1 }}>{row.label}</Text>
            <Toggle value={perms.includes(row.key)} onChange={(v) => toggle(row.key, v)} label={row.label} />
          </View>
        ))}
      </View>

      {addedId ? (
        <View style={{ gap: spacing.sm }}>
          <ActionButton
            label="Import values"
            onPress={() => navigation.replace("SyncDashboard", { importDeviceId: addedId })}
          />
          <ActionButton label="Back to devices" variant="dark" onPress={() => navigation.replace("ConnectedDevices")} />
        </View>
      ) : null}

      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>
        Permissions are the data this device may supply to Fynrox. You can change them any time from Connected Devices.
      </Text>
    </RecoverShell>
  );
}
