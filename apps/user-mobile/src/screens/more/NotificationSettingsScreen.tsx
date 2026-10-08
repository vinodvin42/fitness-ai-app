import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPreferences, UpdateNotificationPreferencesInput } from "@fitness-ai-app/types";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { InfoCard } from "../../components/StatePanels";
import { TextField } from "../../components/TextField";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { GroupCard, SectionLabel, ToggleRow, ValueRow } from "../../components/SettingsParts";
import { fetchNotificationPreferences, updateNotificationPreferences } from "../../api/notifications";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { getNotificationPermissionState, type NotificationPermissionState } from "../../lib/reminderNotifications";
import { resyncLocalReminders } from "../../lib/reminderResync";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "NotificationSettings">;

type CategoryKey = "workoutReminders" | "mealReminders" | "hydrationReminders" | "coachMessages" | "billing" | "marketing";
const CATEGORIES: Array<{ key: CategoryKey; label: string; hint: string }> = [
  { key: "workoutReminders", label: "Workout Reminders", hint: "Reminders for your planned workouts, including changes from your professional." },
  { key: "mealReminders", label: "Meal Logging Reminders", hint: "Nudges at breakfast, lunch, and dinner to record nutrition." },
  { key: "hydrationReminders", label: "Hydration Reminders", hint: "Gentle reminders through the day, within your daily limit." },
  { key: "coachMessages", label: "Messages from your professional", hint: "Alerts when your professional messages you." },
  { key: "billing", label: "Plan, gym & billing updates", hint: "Plan changes, gym holidays, renewals and payment issues." },
  { key: "marketing", label: "Tips & offers", hint: "Optional product news. Off by default." },
];
const CAP_OPTIONS: Array<number | null> = [null, 3, 5, 10, 20];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "22:00" -> "10 PM", "07:30" -> "7:30 AM". */
function formatHour(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === "00" ? `${h12} ${suffix}` : `${h12}:${m} ${suffix}`;
}

/**
 * Figma Settings 10 - Notifications. Master pause + per-category toggles +
 * quiet hours and a daily cap, all backed by GET/PATCH
 * /users/me/notification-preferences. The server applies the master pause,
 * category toggles and cap whenever it creates a notification; the same
 * preferences filter the reminders scheduled on this device (see
 * lib/reminderNotifications.ts#applyReminderPreferences). Quiet hours are
 * stored for push delivery - this build creates inbox rows only.
 */
export function NotificationSettingsScreen({ navigation }: Props) {
  const { updateProfile } = useAuth();
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["notification-preferences"], queryFn: fetchNotificationPreferences });

  const [permission, setPermission] = useState<NotificationPermissionState>("granted");
  const [editing, setEditing] = useState<"quiet" | "cap" | null>(null);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [quietError, setQuietError] = useState<string | null>(null);

  const checkPermission = useCallback(() => {
    getNotificationPermissionState().then(setPermission);
  }, []);
  useFocusEffect(checkPermission);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  const mutation = useMutation({
    mutationFn: (input: UpdateNotificationPreferencesInput) => updateNotificationPreferences(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const prev = queryClient.getQueryData<NotificationPreferences>(["notification-preferences"]);
      if (prev) queryClient.setQueryData<NotificationPreferences>(["notification-preferences"], { ...prev, ...input });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notification-preferences"], ctx.prev);
      Alert.alert("Couldn't save", extractErrorMessage(err, "Check your connection and try again."));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      resyncLocalReminders();
    },
  });

  useEffect(() => {
    if (data && editing !== "quiet") {
      setQuietStart(data.quietHoursStart ?? "");
      setQuietEnd(data.quietHoursEnd ?? "");
    }
  }, [data, editing]);

  const onMaster = (value: boolean) => {
    mutation.mutate({ masterEnabled: value });
    // Keep the on-device reminder master (User.notificationsEnabled) in step.
    updateProfile({ notificationsEnabled: value }).catch(() => undefined);
  };

  const saveQuiet = (clear = false) => {
    const s = clear ? "" : quietStart.trim();
    const e = clear ? "" : quietEnd.trim();
    if ((s === "") !== (e === "")) {
      setQuietError("Set both a start and an end time, or clear both.");
      return;
    }
    if (s !== "" && (!HHMM.test(s) || !HHMM.test(e))) {
      setQuietError("Use 24-hour HH:MM, e.g. 22:00.");
      return;
    }
    setQuietError(null);
    mutation.mutate({ quietHoursStart: s === "" ? null : s, quietHoursEnd: e === "" ? null : e });
    setEditing(null);
  };

  if (isLoading) {
    return (
      <ScreenContainer title="Notifications">
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }
  if (isError || !data) {
    return (
      <ScreenContainer title="Notifications">
        <ErrorState message="Couldn't load your notification preferences." onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  const paused = !data.masterEnabled;
  const quietLabel = data.quietHoursStart && data.quietHoursEnd ? `${formatHour(data.quietHoursStart)} - ${formatHour(data.quietHoursEnd)}` : "Off";
  const capLabel = data.frequencyCap ? `Max ${data.frequencyCap}x / Day` : "No limit";

  return (
    <ScreenContainer title="Notifications">
      {permission !== "granted" ? (
        <Pressable onPress={() => navigation.navigate("NotificationPermission")} accessibilityRole="button" accessibilityLabel="Allow notifications on this device">
          <InfoCard
            tone="accent"
            title="Notifications are off on this device"
            body="Allow them to get reminders on your device. Tap to review what Fynrox will and won't show."
          />
        </Pressable>
      ) : null}

      <GroupCard>
        <ToggleRow
          title="Push Notifications"
          subtitle="Temporarily pause all notifications"
          value={data.masterEnabled}
          onValueChange={onMaster}
        />
      </GroupCard>

      <SectionLabel text="Active Categories" />
      <GroupCard>
        {CATEGORIES.map((c) => (
          <ToggleRow
            key={c.key}
            title={c.label}
            subtitle={c.hint}
            value={data[c.key]}
            disabled={paused}
            onValueChange={(v) => mutation.mutate({ [c.key]: v })}
          />
        ))}
      </GroupCard>

      <SectionLabel text="Medicine, water & workout reminders" />
      <GroupCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>Reminders & Routines</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 11 }}>Manage saved reminders</Text>
          </View>
          <Pressable
            onPress={() => navigation.getParent()?.navigate("Train", { screen: "RemindersRoutines" })}
            accessibilityRole="button"
            accessibilityLabel="Manage reminders and routines"
            style={{ backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}
          >
            <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodyBold, fontSize: 13 }}>Manage</Text>
          </Pressable>
        </View>
      </GroupCard>

      <SectionLabel text="Quiet hours & limits" />
      <GroupCard>
        <ValueRow
          title="Quiet Hours"
          subtitle={data.quietHoursStart ? "Do not disturb schedule activated" : "No quiet hours set"}
          value={quietLabel}
          onPress={() => setEditing(editing === "quiet" ? null : "quiet")}
        />
        {editing === "quiet" ? (
          <View style={{ padding: 14, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextField
                containerStyle={{ flex: 1 }}
                label="From (HH:MM)"
                value={quietStart}
                onChangeText={setQuietStart}
                placeholder="22:00"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
              />
              <TextField
                containerStyle={{ flex: 1 }}
                label="Until (HH:MM)"
                value={quietEnd}
                onChangeText={setQuietEnd}
                placeholder="07:00"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            {quietError ? <Text style={{ color: colors.danger, ...typography.meta }}>{quietError}</Text> : null}
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>Push alerts are held during this window.</Text>
            <Button label="Save quiet hours" onPress={() => saveQuiet(false)} loading={mutation.isPending} />
            {data.quietHoursStart ? <Button label="Turn off quiet hours" variant="secondary" onPress={() => saveQuiet(true)} /> : null}
          </View>
        ) : null}
        <ValueRow
          title="Alert Frequency Cap"
          subtitle="Throttle excessive notification noise"
          value={capLabel}
          onPress={() => setEditing(editing === "cap" ? null : "cap")}
        />
        {editing === "cap" ? (
          <View style={{ padding: 14, gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>Most notifications you can receive in a day.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {CAP_OPTIONS.map((n) => (
                <Chip
                  key={String(n)}
                  label={n === null ? "No limit" : `${n} / day`}
                  selected={data.frequencyCap === n}
                  onPress={() => {
                    mutation.mutate({ frequencyCap: n });
                    setEditing(null);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
      </GroupCard>
    </ScreenContainer>
  );
}
