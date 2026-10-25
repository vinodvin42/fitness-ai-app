import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { fetchReminders } from "../api/reminders";
import { fetchNotificationPreferences } from "../api/notifications";
import { fetchMedications } from "../api/medications";
import { useAuth } from "../context/AuthContext";
import { applyReminderPreferences, getNotificationPermissionState, syncScheduledNotifications } from "./reminderNotifications";
import { syncMedicationNotifications } from "./medicationNotifications";

const MIN_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Re-plans on-device reminder and medicine alarms when the app opens and when it comes back to the
 * foreground, at most every 6 hours (25 Oct 2026). Reminders with a start or end date get dated alarms
 * for a rolling window (lib/reminderSchedule.ts); this tops that window up and moves a reminder from
 * the weekly repeat to dated alarms as its end date comes near. Never prompts for permission.
 */
export function useLocalReminderRefresh() {
  const { user } = useAuth();
  const lastRun = useRef(0);
  const userId = user?.id;
  const notificationsEnabled = user?.notificationsEnabled;

  useEffect(() => {
    if (Platform.OS === "web" || !userId) return;
    lastRun.current = 0;
    const run = async () => {
      if (Date.now() - lastRun.current < MIN_GAP_MS) return;
      lastRun.current = Date.now();
      try {
        if ((await getNotificationPermissionState()) !== "granted") return;
        const [reminders, prefs, meds] = await Promise.all([fetchReminders(), fetchNotificationPreferences(), fetchMedications()]);
        await syncScheduledNotifications(notificationsEnabled === false ? [] : applyReminderPreferences(reminders, prefs));
        await syncMedicationNotifications(meds);
      } catch {
        // Best-effort: the next open tries again.
        lastRun.current = 0;
      }
    };
    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => sub.remove();
  }, [userId, notificationsEnabled]);
}
