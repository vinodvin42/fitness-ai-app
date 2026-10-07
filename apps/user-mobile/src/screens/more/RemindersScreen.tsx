import React from "react";
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Reminder } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchReminders, updateReminder } from "../../api/reminders";
import { useReminderSync } from "../../lib/useReminderSync";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Reminders">;

const CATEGORY_LABEL: Record<Reminder["category"], string> = {
  workout: "Workout",
  meal: "Meal",
  water: "Water",
  measurement: "Measurement",
  general: "General",
};

const CATEGORY_META: Record<Reminder["category"], { icon: IconName; tint: string; tintSoft: string }> = {
  workout: { icon: "dumbbell", tint: colors.accent, tintSoft: colors.accentSoft },
  meal: { icon: "utensils", tint: colors.success, tintSoft: colors.successSoft },
  water: { icon: "droplet", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)" },
  measurement: { icon: "trending-up", tint: colors.warning, tintSoft: colors.warningSoft },
  general: { icon: "bell", tint: colors.aiAccent, tintSoft: colors.aiAccentSoft },
};

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

function formatDays(daysOfWeek: number[]) {
  if (daysOfWeek.length === 7) return "Every day";
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted.join(",") === "1,2,3,4,5") return "Weekdays";
  if (sorted.length === 2 && sorted.join(",") === "0,6") return "Weekends";
  return sorted.map((d) => DAY_ABBR[d]).join(", ");
}

/**
 * Reminders list (docs/mobile/03-screen-inventory.md §K, Phase 4) —
 * "My Reminders" isn't its own named screen in the design doc, which only
 * describes "Add Reminder"; this list is the natural entry point a real
 * app needs before you can add/edit/delete anything, so it's built here
 * alongside the form. Every reminder is a real, on-device local
 * notification (via expo-notifications, apps/user-mobile's
 * src/lib/reminderNotifications.ts) — there's no server-push
 * infrastructure anywhere in this app.
 */
export function RemindersScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { data: reminders, isLoading, isError, refetch } = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders });

  // Master/category preferences gate scheduling; the OS prompt is preceded by the pre-prompt screen.
  useReminderSync(reminders, () => navigation.navigate("NotificationPermission"));

  const onToggle = async (reminder: Reminder, isEnabled: boolean) => {
    try {
      await updateReminder(reminder.id, { isEnabled });
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err) {
      Alert.alert("Couldn't update reminder", extractErrorMessage(err, "Check your connection and try again."));
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer title="Reminders">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer title="Reminders">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Reminders">
      <Button label="+ Add Reminder" onPress={() => navigation.navigate("ReminderForm", {})} />

      {(reminders ?? []).length === 0 ? (
        <EmptyState
          title="No reminders yet"
          subtitle="Add one for workouts, meals, water, or measurements."
          style={{ marginTop: spacing.md }}
        />
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {(reminders ?? []).map((reminder) => {
            const meta = CATEGORY_META[reminder.category];
            return (
              <Card key={reminder.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: radius.md,
                      backgroundColor: meta.tintSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={meta.icon} size={22} color={meta.tint} />
                  </View>
                  <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("ReminderForm", { reminder })}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{reminder.label}</Text>
                    <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                      {formatTime(reminder.hour, reminder.minute)} · {formatDays(reminder.daysOfWeek)}
                    </Text>
                  </Pressable>
                  <Switch
                    value={reminder.isEnabled}
                    onValueChange={(value) => onToggle(reminder, value)}
                    trackColor={{ true: colors.accent, false: colors.border }}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
