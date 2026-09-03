import * as Notifications from "expo-notifications";
import type { Reminder } from "@fitness-ai-app/types";

/**
 * Local, on-device notification scheduling for Reminders
 * (docs/mobile/03-screen-inventory.md §K). There is no server-push
 * infrastructure anywhere in this app — apps/api's reminders module only
 * stores *what* to schedule; this file is what actually turns that into
 * real iOS notifications via expo-notifications.
 *
 * Sync strategy: full cancel-and-reschedule. Rather than tracking which
 * Expo-assigned notification ID belongs to which reminder/day (fragile —
 * those ids aren't returned to the server and would need their own local
 * persistence to survive an app restart), `syncScheduledNotifications`
 * wipes every scheduled local notification and reschedules from scratch
 * off the current reminder list. Simpler and self-healing, at the cost of
 * a redundant reschedule on every call — fine at this app's scale.
 *
 * `Reminder.daysOfWeek` uses JS's `Date.getDay()` convention (0 = Sunday
 * .. 6 = Saturday), matching apps/api end to end. Expo's WeeklyTriggerInput
 * uses `weekday` 1 = Sunday .. 7 = Saturday, so the only conversion this
 * file does is `jsDay + 1` — see WeeklyTriggerInput's own doc comment in
 * expo-notifications' types.
 */

// Show the alert (and play its sound) even while the app is in the
// foreground — otherwise iOS silently drops foregrounded notifications by
// default, which would make a reminder look like it never fired if the
// app happened to be open at the scheduled time.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CATEGORY_TITLE: Record<Reminder["category"], string> = {
  workout: "Workout reminder",
  meal: "Meal reminder",
  water: "Water reminder",
  measurement: "Measurement reminder",
  general: "Reminder",
};

/** Ask for local-notification permission. Call this once, e.g. on the Reminders list mounting. */
export async function requestNotificationPermissions() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Cancels every scheduled local notification and reschedules one per
 * (enabled reminder × day-of-week). Call this after any create/update/
 * delete/toggle, and once on the Reminders list mounting so a fresh
 * install picks up whatever's already on the server.
 */
export async function syncScheduledNotifications(reminders: Reminder[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const reminder of reminders) {
    if (!reminder.isEnabled) continue;

    for (const jsDay of reminder.daysOfWeek) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: CATEGORY_TITLE[reminder.category],
          body: reminder.label,
          sound: reminder.playSound,
        },
        trigger: {
          weekday: jsDay + 1,
          hour: reminder.hour,
          minute: reminder.minute,
          repeats: true,
        },
      });
    }
  }
}
