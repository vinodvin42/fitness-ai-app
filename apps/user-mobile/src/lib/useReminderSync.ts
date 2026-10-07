import { useEffect } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { Reminder } from "@fitness-ai-app/types";
import { fetchNotificationPreferences } from "../api/notifications";
import { useAuth } from "../context/AuthContext";
import { applyReminderPreferences, getNotificationPermissionState, syncScheduledNotifications } from "./reminderNotifications";

let promptedThisSession = false;

/**
 * Keeps on-device reminder notifications in step with the reminder list and
 * the user's notification preferences. Never triggers the OS permission
 * dialog itself: when permission hasn't been asked yet and there is an
 * enabled reminder, `onNeedsPermission` is called once per app session so the
 * caller can show the "Want a gentle reminder?" pre-prompt first.
 */
export function useReminderSync(reminders: Reminder[] | undefined, onNeedsPermission: () => void) {
  const { user } = useAuth();
  const prefs = useQuery({ queryKey: ["notification-preferences"], queryFn: fetchNotificationPreferences });
  const prefsData = prefs.data;
  const prefsSettled = !prefs.isLoading;
  const notificationsEnabled = user?.notificationsEnabled;

  useEffect(() => {
    if (!reminders || !prefsSettled) return;
    (async () => {
      const state = await getNotificationPermissionState();
      if (state === "granted") {
        const list = notificationsEnabled === false ? [] : applyReminderPreferences(reminders, prefsData);
        await syncScheduledNotifications(list);
      } else if (state === "undetermined" && Platform.OS !== "web" && !promptedThisSession && reminders.some((r) => r.isEnabled)) {
        promptedThisSession = true;
        onNeedsPermission();
      }
    })().catch(() => {
      // Local scheduling is best-effort - never block viewing or editing reminders.
    });
    // onNeedsPermission is intentionally excluded: callers pass an inline closure.
  }, [reminders, prefsData, prefsSettled, notificationsEnabled]);
}
