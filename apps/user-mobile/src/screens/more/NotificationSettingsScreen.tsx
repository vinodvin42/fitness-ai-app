import React, { useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "NotificationSettings">;

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

      <Button
        label="Manage Reminders"
        variant="secondary"
        onPress={() => navigation.navigate("Reminders")}
        style={{ marginTop: spacing.md }}
      />
    </ScreenContainer>
  );
}
