import * as Notifications from "expo-notifications";
import type { NotificationPreferences, Reminder } from "@fitness-ai-app/types";

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
  // Cancel only what this file owns — medication notifications (see
  // medicationNotifications.ts) share the same OS scheduler and are tagged
  // data.kind === "medication", so they must survive a reminder resync.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (String(n.content.data?.kind ?? "").startsWith("medication")) continue;
    await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }

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

/**
 * Applies the user's server-side notification preferences (Settings 10) to
 * the local reminder list before scheduling: the master pause drops
 * everything, and workout / meal / water reminders follow their own toggles.
 * Quiet hours and the daily cap are enforced server-side for inbox rows; a
 * local reminder is something the user scheduled themselves, so it is not
 * throttled here.
 */
export function applyReminderPreferences(
  reminders: Reminder[],
  prefs: Pick<NotificationPreferences, "masterEnabled" | "workoutReminders" | "mealReminders" | "hydrationReminders"> | undefined,
): Reminder[] {
  if (!prefs) return reminders;
  if (!prefs.masterEnabled) return [];
  return reminders.filter((r) => {
    if (r.category === "workout") return prefs.workoutReminders;
    if (r.category === "meal") return prefs.mealReminders;
    if (r.category === "water") return prefs.hydrationReminders;
    return true;
  });
}

export type NotificationPermissionState = "granted" | "denied" | "undetermined";

/** Current OS permission without prompting. Web / unsupported platforms report "undetermined" on failure. */
export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return "granted";
    // Denied but still askable (e.g. Android after one refusal) counts as undetermined: the OS prompt can still appear.
    return p.status === "denied" && p.canAskAgain === false ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}
