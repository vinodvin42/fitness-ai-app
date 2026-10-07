import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StateLayout, InfoCard } from "../../components/StatePanels";
import { Icon } from "../../components/Icon";
import { BRAND_NAME } from "../../lib/brand";
import { lockScreenCopy } from "../../lib/medicationReminder";
import { getNotificationPermissionState, type NotificationPermissionState } from "../../lib/reminderNotifications";
import { resyncLocalReminders } from "../../lib/reminderResync";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "NotificationPermission">;

/**
 * Figma Settings 14 - "Want a gentle reminder?". Shown BEFORE the OS
 * notification permission dialog (from Notification settings, and when an
 * enabled reminder exists but permission was never asked). When the OS has
 * already said no, "Open settings" deep-links to the device settings; when
 * it hasn't been asked yet, the primary action asks for permission.
 */
export function NotificationPermissionScreen({ navigation }: Props) {
  const [state, setState] = useState<NotificationPermissionState>("undetermined");
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(() => {
    getNotificationPermissionState().then(setState);
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const lock = lockScreenCopy(false, "");

  const onPrimary = async () => {
    if (state === "granted") {
      navigation.goBack();
      return;
    }
    if (state === "denied") {
      Linking.openSettings().catch(() => undefined);
      return;
    }
    setAsking(true);
    try {
      const res = await Notifications.requestPermissionsAsync();
      if (res.granted) {
        await resyncLocalReminders();
        navigation.goBack();
      } else {
        refresh();
      }
    } catch {
      refresh();
    } finally {
      setAsking(false);
    }
  };

  const granted = state === "granted";
  return (
    <StateLayout
      showBrand
      flowLabel="Notifications"
      flowIcon={granted ? "bell" : "bell-off"}
      title="Want a gentle reminder?"
      description={
        granted
          ? `Notifications are allowed for ${BRAND_NAME}. Your reminders will appear on this device.`
          : state === "denied"
            ? `Notifications are currently not allowed for ${BRAND_NAME}. Enable them in settings if you'd like scheduled reminders on your device.`
            : `${BRAND_NAME} can nudge you about workouts, meals, water and medicines. Allow notifications if you'd like scheduled reminders on your device.`
      }
      footnote="Optional. Your app remains usable without notifications."
      onBack={() => navigation.goBack()}
      actions={[
        {
          label: granted ? "Done" : state === "denied" ? "Open settings" : "Allow notifications",
          onPress: onPrimary,
          loading: asking,
        },
        { label: "Not now", variant: "secondary", onPress: () => navigation.goBack() },
      ]}
    >
      {granted ? null : (
        <InfoCard
          tone="accent"
          title={state === "denied" ? "Permission not granted" : "Not asked yet"}
          body="Push alerts won't appear while permission is off. Scheduled reminders remain visible in the app; device delivery is not guaranteed."
        />
      )}
      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.8 }}>LOCK-SCREEN PREVIEW</Text>
          <Icon name="lock" size={14} color={colors.textMuted} />
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{lock.title}</Text>
        {lock.lines.map((line, i) => (
          <Text key={i} style={{ color: i === 0 ? colors.textPrimary : colors.textMuted, ...typography.meta, fontSize: i === 0 ? 13 : 12 }}>
            {line}
          </Text>
        ))}
      </View>
      <InfoCard
        title="Private by default"
        body={`Lock-screen text is generic. It doesn't show your reminder name, medicine, dose, health conditions or fitness details. Open ${BRAND_NAME} to view your in-app reminder.`}
      />
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
        {state === "denied"
          ? `Open your device settings and allow notifications for ${BRAND_NAME}. You can change permission and reminder preferences later.`
          : "You can change permission and reminder preferences later in Settings > Notifications."}
      </Text>
    </StateLayout>
  );
}
