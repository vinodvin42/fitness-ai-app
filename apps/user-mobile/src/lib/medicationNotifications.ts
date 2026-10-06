import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Medication } from "@fitness-ai-app/types";
import { lockScreenBody, lockScreenCopy } from "./medicationReminder";

/**
 * Local on-device notifications for medication schedule times, following
 * the same full cancel-and-reschedule strategy as reminderNotifications.ts
 * — but scoped to notifications tagged `data.kind === "medication"` so the
 * two sync passes never wipe each other. One-off snooze re-reminders use
 * `data.kind === "medication-snooze"` and are left alone by both passes.
 *
 * Lock-screen copy is generic unless the medication's "Detailed Preview"
 * toggle is on (Figma medicine/01-05): by default no medicine name or dose
 * ever appears outside the app. Per-medication toggles: push off => nothing
 * is scheduled; sound off => silent; vibration => Android vibrate pattern
 * (iOS has no per-notification haptic).
 * Weekly-repeating triggers can't express start/end dates, so ended
 * medications are simply not scheduled and a past `startDate` is ignored
 * (a not-yet-started medication still fires; the in-app due list is the
 * source of truth). "Once" reminders are scheduled as a single dated trigger.
 * Unverified on a physical device.
 */

type NotificationFlags = Pick<Medication, "soundEnabled" | "vibrationEnabled" | "detailedPreview" | "name">;

function contentFor(med: NotificationFlags, data: Record<string, unknown>): Notifications.NotificationContentInput {
  const copy = lockScreenCopy(med.detailedPreview, med.name);
  return {
    title: copy.title,
    body: lockScreenBody(copy),
    sound: med.soundEnabled,
    ...(med.vibrationEnabled ? { vibrate: [0, 250, 250, 250] } : {}),
    data,
  };
}

export async function syncMedicationNotifications(medications: Medication[]): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content.data?.kind === "medication") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    for (const med of medications) {
      if (!med.isActive || med.pushEnabled === false) continue;
      if (med.endDate && med.endDate.slice(0, 10) < today) continue;
      for (const time of med.scheduleTimes) {
        const [h, m] = time.split(":").map((v) => Number(v));
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        const data = { kind: "medication", medicationId: med.id, time, deepLink: "/medicine/due" };
        if (med.repeatMode === "once") {
          const [y, mo, d] = med.startDate.slice(0, 10).split("-").map((v) => Number(v));
          const at = new Date(y, mo - 1, d, h, m, 0, 0);
          if (at.getTime() <= now.getTime()) continue;
          await Notifications.scheduleNotificationAsync({
            content: contentFor(med, data),
            trigger: { date: at },
          });
          continue;
        }
        for (const jsDay of med.daysOfWeek) {
          await Notifications.scheduleNotificationAsync({
            content: contentFor(med, data),
            trigger: { weekday: jsDay + 1, hour: h, minute: m, repeats: true },
          });
        }
      }
    }
  } catch {
    // Scheduling is best-effort (permission denied, unsupported platform).
  }
}

/** Local "Remind again" notification for a snoozed occurrence. Best-effort; no-op on web. */
export async function scheduleSnoozeNotification(med: Medication, scheduledFor: string, remindAt: Date): Promise<void> {
  if (Platform.OS === "web" || med.pushEnabled === false) return;
  try {
    await cancelSnoozeNotification(med.id, scheduledFor);
    await Notifications.scheduleNotificationAsync({
      content: contentFor(med, { kind: "medication-snooze", medicationId: med.id, scheduledFor, deepLink: "/medicine/due" }),
      trigger: { date: remindAt },
    });
  } catch {
    // permission denied or unsupported
  }
}

/** Clears a pending snooze notification (Undo snooze, or the occurrence was logged). */
export async function cancelSnoozeNotification(medicationId: string, scheduledFor: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const d = n.content.data as Record<string, unknown> | undefined;
      if (d?.kind === "medication-snooze" && d.medicationId === medicationId && d.scheduledFor === scheduledFor) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // ignore
  }
}
