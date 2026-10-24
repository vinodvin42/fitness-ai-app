import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * The workout on the lock screen and the watch (owner, 24 Oct 2026: "Watch:
 * via phone notifications"; Figma widgets/05 "Rest 1:12 · Bench Press / Set 3
 * of 4 · Next: 24 kg × 10"). While a workout is open, one ongoing, silent
 * notification shows the exercise and set, or when the rest ends; Wear OS
 * and other watches mirror phone notifications, so it shows on the wrist too.
 * When a rest is running, a separate "Rest over" alert is scheduled for its
 * end, so the phone and the watch buzz when it's time for the next set.
 *
 * Nothing is shown without notification permission (asked in Reminders), and
 * nothing at all on web. Every call is best-effort: a notification failure
 * never interrupts the workout. Android lets the member silence either
 * channel ("Workout in progress", "Rest timer") in system settings.
 */
const LIVE_ID = "fynrox-workout-live";
const REST_ID = "fynrox-rest-over";
const LIVE_CHANNEL = "workout-live";
const ALERT_CHANNEL = "workout-alerts";
export const WORKOUT_LIVE_KIND = "workout-live";

let channels: Promise<void> | null = null;
function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  channels ??= Promise.all([
    Notifications.setNotificationChannelAsync(LIVE_CHANNEL, {
      name: "Workout in progress",
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
    }),
    Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: "Rest timer",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 150, 300],
    }),
  ])
    .then(() => undefined)
    .catch(() => {
      channels = null;
    });
  return channels;
}

async function allowed(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export interface LiveWorkout {
  workoutName: string;
  exerciseName: string;
  /** "Set 3 of 4" */
  setLine: string;
  /** "Next: 24 kg × 10" */
  nextLine: string;
  /** When the running rest ends (epoch ms), else null. */
  restEndsAt: number | null;
}

/** The notification's text, kept pure for tests/workoutNotification.check.cjs. */
export function liveWorkoutText(w: LiveWorkout, formatTime: (ms: number) => string = clock): { title: string; body: string } {
  return {
    title: w.workoutName,
    body: w.restEndsAt
      ? `Rest until ${formatTime(w.restEndsAt)} · ${w.exerciseName}\n${w.setLine} · ${w.nextLine}`
      : `${w.exerciseName}\n${w.setLine} · ${w.nextLine}`,
  };
}

/** Show or update the ongoing workout notification (the same one is replaced each time). */
export async function showWorkoutNotification(w: LiveWorkout): Promise<void> {
  try {
    if (!(await allowed())) return;
    await ensureChannels();
    const { title, body } = liveWorkoutText(w);
    await Notifications.scheduleNotificationAsync({
      identifier: LIVE_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        data: { kind: WORKOUT_LIVE_KIND },
      },
      trigger: Platform.OS === "android" ? { channelId: LIVE_CHANNEL } : null,
    });
  } catch {
    // Best-effort.
  }
}

/** Schedule the "Rest over" alert for when the rest ends (replacing any earlier one). */
export async function scheduleRestOver(endsAt: number, exerciseName: string, nextLine: string): Promise<void> {
  try {
    if (!(await allowed())) return;
    await ensureChannels();
    await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => undefined);
    const seconds = Math.max(1, Math.round((endsAt - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: "Rest over", body: `${exerciseName} · ${nextLine}`, sound: true, data: { kind: "rest-over" } },
      trigger: { seconds, channelId: ALERT_CHANNEL },
    });
  } catch {
    // Best-effort.
  }
}

export async function cancelRestOver(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => undefined);
}

/** Remove both when the workout screen closes (finished, discarded or left). */
export async function clearWorkoutNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelRestOver();
  await Notifications.dismissNotificationAsync(LIVE_ID).catch(() => undefined);
}
