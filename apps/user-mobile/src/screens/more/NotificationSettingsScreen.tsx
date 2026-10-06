import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Switch, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPreferences, UpdateNotificationPreferencesInput } from "@fitness-ai-app/types";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { InfoCard, StateLayout } from "../../components/StatePanels";
import { TextField } from "../../components/TextField";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchNotificationPreferences, updateNotificationPreferences } from "../../api/notifications";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "NotificationSettings">;

type ToggleKey = "workoutReminders" | "mealReminders" | "coachMessages" | "billing" | "marketing";
const TOGGLES: Array<{ key: ToggleKey; label: string; hint: string }> = [
  { key: "workoutReminders", label: "Workout reminders", hint: "Nudges for planned training" },
  { key: "mealReminders", label: "Meal reminders", hint: "Logging and meal-plan prompts" },
  { key: "coachMessages", label: "Coach messages", hint: "Replies from your coach or professional" },
  { key: "billing", label: "Billing & plan", hint: "Payments, renewals and plan changes" },
  { key: "marketing", label: "Tips & offers", hint: "Optional product news" },
];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Real per-category preferences + quiet hours (GET/PATCH /users/me/notification-preferences). */
function ServerPreferencesCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: fetchNotificationPreferences,
  });
  const [quietStart, setQuietStart] = useState<string | null>(null);
  const [quietEnd, setQuietEnd] = useState<string | null>(null);
  const [quietError, setQuietError] = useState<string | null>(null);

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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  if (isLoading) return <SkeletonCard lines={4} />;
  if (isError || !data) return <ErrorState message="Couldn't load your notification preferences." onRetry={() => refetch()} />;

  const startValue = quietStart ?? data.quietHoursStart ?? "";
  const endValue = quietEnd ?? data.quietHoursEnd ?? "";

  const saveQuiet = () => {
    const s = startValue.trim();
    const e = endValue.trim();
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
    setQuietStart(null);
    setQuietEnd(null);
  };

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>What you get notified about</Text>
        {TOGGLES.map((t) => (
          <View key={t.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t.label}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t.hint}</Text>
            </View>
            <Switch
              value={data[t.key]}
              onValueChange={(v) => mutation.mutate({ [t.key]: v })}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t.label}
            />
          </View>
        ))}
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Quiet hours</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          Push alerts are held during this window. Leave both empty to turn quiet hours off.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextField
            containerStyle={{ flex: 1 }}
            label="From (HH:MM)"
            value={startValue}
            onChangeText={setQuietStart}
            placeholder="22:00"
            maxLength={5}
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            containerStyle={{ flex: 1 }}
            label="Until (HH:MM)"
            value={endValue}
            onChangeText={setQuietEnd}
            placeholder="07:00"
            maxLength={5}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        {quietError ? <Text style={{ color: colors.danger, ...typography.meta }}>{quietError}</Text> : null}
        <Button label="Save quiet hours" variant="secondary" loading={mutation.isPending} onPress={saveQuiet} />
      </Card>
    </>
  );
}

/**
 * Notification Settings (docs/mobile/03-screen-inventory.md §L) — the
 * design shows a master toggle plus 6+ individually-toggleable
 * categories and two "advanced" rows. This build only has one real thing
 * to gate: local, on-device Reminder notifications (§K, Phase 4) — there
 * is no push infrastructure anywhere in this app for the design's
 * broader notion of notification categories (achievement alerts, weekly
 * summaries, etc. would need server-push, see gap §16). So this screen
 * is deliberately just the one master switch (`User.notificationsEnabled`
 * — gates whether the client schedules ANY local notification at all,
 * see apps/user-mobile's src/lib/reminderNotifications.ts), plus a link
 * to Reminders for the real per-item/per-category control that already
 * exists there. Building a second, parallel category-toggle UI here
 * would just duplicate — and risk disagreeing with — the Reminders
 * screen's own per-reminder `isEnabled` toggle.
 */
export function NotificationSettingsScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notificationsEnabled ?? true);
  const [isSaving, setIsSaving] = useState(false);
  // Settings 13 — OS-level notification permission (separate from the in-app master switch).
  const [osDenied, setOsDenied] = useState(false);
  const [dismissedDenied, setDismissedDenied] = useState(false);

  const checkPermission = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setOsDenied(p.status === "denied"))
      .catch(() => undefined);
  }, []);
  // Re-check on focus and when returning from the OS Settings app.
  useFocusEffect(checkPermission);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  const onToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    setIsSaving(true);
    try {
      await updateProfile({ notificationsEnabled: value });
    } catch (err) {
      setNotificationsEnabled(!value);
      Alert.alert("Couldn't save preference", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  if (osDenied && !dismissedDenied) {
    return (
      <StateLayout
        flowLabel="Permissions / Notifications"
        flowIcon="bell-off"
        title="Want a gentle reminder?"
        description="Notifications are currently not allowed for 23PrimeFit. Enable them in settings if you'd like scheduled reminders on your device."
        footnote="Optional. Your app remains usable without notifications."
        onBack={() => navigation.goBack()}
        actions={[
          { label: "Open settings", onPress: () => Linking.openSettings().catch(() => undefined) },
          { label: "Not now", variant: "secondary", onPress: () => setDismissedDenied(true) },
        ]}
      >
        <InfoCard
          tone="accent"
          title="Permission not granted"
          body="Push alerts won't appear while permission is off. Scheduled reminders remain visible in the app; device delivery is not guaranteed."
        />
        <InfoCard
          title="Private by default"
          body="Lock-screen text is generic. It doesn't show your reminder name, medicine, dose, health conditions or fitness details. Open 23PrimeFit to view your in-app reminder."
        />
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
          Open your device settings and allow notifications for 23PrimeFit. You can change permission and reminder preferences later.
        </Text>
      </StateLayout>
    );
  }

  return (
    <ScreenContainer title="Notifications">
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Reminder notifications</Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
              Master switch for every Reminder's local, on-device notification. Turning this off cancels all of
              them without deleting or disabling any individual reminder.
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={onToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        {isSaving ? <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Saving…</Text> : null}
      </Card>

      <ServerPreferencesCard />

      <Button
        label="Manage Reminders"
        variant="secondary"
        onPress={() => navigation.navigate("Reminders")}
        style={{ marginTop: spacing.md }}
      />
    </ScreenContainer>
  );
}
