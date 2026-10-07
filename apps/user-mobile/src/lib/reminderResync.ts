import { Platform } from "react-native";
import { fetchReminders } from "../api/reminders";
import { fetchNotificationPreferences } from "../api/notifications";
import { applyReminderPreferences, getNotificationPermissionState, syncScheduledNotifications } from "./reminderNotifications";

/** Re-schedules on-device reminders after a notification preference changed. Best-effort; never prompts. */
export async function resyncLocalReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if ((await getNotificationPermissionState()) !== "granted") return;
    const [reminders, prefs] = await Promise.all([fetchReminders(), fetchNotificationPreferences()]);
    await syncScheduledNotifications(applyReminderPreferences(reminders, prefs));
  } catch {
    /* scheduling is best-effort */
  }
}
