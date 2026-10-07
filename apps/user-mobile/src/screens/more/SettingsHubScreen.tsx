import React from "react";
import { Alert, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pill } from "../../components/Pill";
import { useAuth } from "../../context/AuthContext";
import { fetchDevices } from "../../api/devices";
import { fetchCurrentSubscription } from "../../api/subscriptions";
import { updateWorkoutSettings, useWorkoutSettings, WORKOUT_SETTINGS_KEY } from "../../api/workoutSettings";
import { BRAND_NAME } from "../../lib/brand";
import { languageLabel } from "../../lib/languages";
import { HR_SYNC_KEY, LARGER_TEXT_KEY, useLocalFlag } from "../../lib/localSettings";
import { resolveUnits } from "../../lib/measureUnits";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader, RowGroup, SettingRow, ToggleRow } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "SettingsHub">;

/** "kg, cm" for the default metric set, "lb, ft" for imperial, "Custom" when the measures are mixed. */
export function unitsSummary(prefs: Parameters<typeof resolveUnits>[0], unitSystem: Parameters<typeof resolveUnits>[1]): string {
  const u = resolveUnits(prefs, unitSystem);
  const metric = u.weight === "kg" && u.height === "cm" && u.distance === "km" && u.temperature === "C" && u.water === "ml";
  const imperial = u.weight === "lb" && u.height === "ft" && u.distance === "mi" && u.temperature === "F" && u.water === "oz";
  if (metric) return "Metric (kg, cm)";
  if (imperial) return "Imperial (lb, ft)";
  return "Custom";
}

/**
 * Settings (Figma Profile & Settings 04). Display & theme, general
 * preferences, workout & tracking and security groups. Where a setting maps to
 * an existing real setting it is wired to it: Sound effects, Keep screen on
 * and Audio cues are the account's workout settings (countdown sound, keep
 * screen awake, audio coaching); App lock is the biometric lock; Larger text
 * and Real-time HR sync are saved on this device. Real-time HR sync can only
 * be switched on once a device is connected.
 */
export function SettingsHubScreen({ navigation }: Props) {
  const { user, isBiometricHardwareReady, isBiometricLockEnabled, enableBiometricLock, disableBiometricLock } = useAuth();
  const queryClient = useQueryClient();
  const workout = useWorkoutSettings();
  const plan = useQuery({ queryKey: ["subscriptions", "current"], queryFn: fetchCurrentSubscription });
  const devices = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });
  const [largerText, setLargerText] = useLocalFlag(LARGER_TEXT_KEY, true);
  const [hrSync, setHrSync] = useLocalFlag(HR_SYNC_KEY, false);

  const hasDevice = (devices.data ?? []).length > 0;
  const planName = plan.data?.plan.name;

  const setWorkout = async (patch: { countdownSound?: boolean; keepScreenAwake?: boolean; audioCoaching?: boolean }) => {
    try {
      const next = await updateWorkoutSettings(patch);
      queryClient.setQueryData(WORKOUT_SETTINGS_KEY, next);
    } catch (err) {
      Alert.alert("Couldn't save setting", extractErrorMessage(err, "Check your connection and try again."));
    }
  };

  const onAppLock = async (on: boolean) => {
    try {
      if (on) {
        const ok = await enableBiometricLock();
        if (!ok) Alert.alert("App lock", "We couldn't confirm your biometrics, so App lock is still off.");
      } else {
        await disableBiometricLock();
      }
    } catch (err) {
      Alert.alert("Couldn't change App lock", extractErrorMessage(err, "Try again."));
    }
  };

  const ws = workout.data;

  return (
    <RecoverShell centered title="Settings" onBack={() => navigation.goBack()}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Preferences</Text>
        {planName ? <Pill label={planName.toUpperCase()} tone="accent" /> : null}
      </View>

      <GroupHeader>Display & Theme</GroupHeader>
      <RowGroup>
        <ToggleRow
          icon="sliders"
          title="Larger text"
          subtitle="Follow your device's text size up to 150%"
          value={largerText}
          onValueChange={setLargerText}
        />
        <SettingRow icon="moon" title="Appearance" value="Dark" onPress={() => navigation.navigate("Appearance")} />
      </RowGroup>

      <GroupHeader>General Preferences</GroupHeader>
      <RowGroup>
        <SettingRow
          icon="ruler"
          title="Unit Measure"
          value={unitsSummary(user?.unitPreferences, user?.unitSystem)}
          onPress={() => navigation.navigate("MeasurementUnits")}
        />
        <SettingRow icon="globe" title="Language" value={languageLabel(user?.languagePreference)} onPress={() => navigation.navigate("LanguageSelection")} />
        <SettingRow
          icon="bell"
          title="Notification Preferences"
          value={user?.notificationsEnabled === false ? "Off" : "On"}
          onPress={() => navigation.navigate("NotificationSettings")}
        />
        <ToggleRow
          icon="volume-2"
          title="Sound Effects"
          subtitle="Audio prompts during training"
          value={ws?.countdownSound ?? true}
          disabled={!ws}
          onValueChange={(v) => void setWorkout({ countdownSound: v })}
        />
        <ToggleRow
          icon="smartphone"
          title="Keep screen on"
          subtitle="During active workouts"
          value={ws?.keepScreenAwake ?? true}
          disabled={!ws}
          onValueChange={(v) => void setWorkout({ keepScreenAwake: v })}
        />
      </RowGroup>

      <GroupHeader>Workout & Tracking</GroupHeader>
      <RowGroup>
        <ToggleRow
          icon="heart-pulse"
          title="Real-time HR Sync"
          subtitle={hasDevice ? "Use your connected device's heart rate in workouts" : "Connect a device to turn this on"}
          value={hasDevice && hrSync}
          disabled={!hasDevice}
          onValueChange={setHrSync}
        />
        <ToggleRow
          icon="mic"
          title="Audio cues"
          subtitle="Spoken coaching during workouts"
          value={ws?.audioCoaching ?? true}
          disabled={!ws}
          onValueChange={(v) => void setWorkout({ audioCoaching: v })}
        />
      </RowGroup>

      <GroupHeader>Security</GroupHeader>
      <RowGroup>
        <ToggleRow
          icon="lock"
          title="App lock"
          subtitle={isBiometricHardwareReady ? "Ask for Face ID / fingerprint when you open the app" : "Biometrics aren't available on this device"}
          value={isBiometricLockEnabled}
          disabled={!isBiometricHardwareReady}
          onValueChange={(v) => void onAppLock(v)}
        />
      </RowGroup>

      <View style={{ alignItems: "center", gap: 2, marginTop: spacing.sm }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          {BRAND_NAME} {Constants.expoConfig?.version ?? ""}
          {planName ? ` · ${planName}` : ""}
        </Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          Copyright © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
        </Text>
      </View>
    </RecoverShell>
  );
}
