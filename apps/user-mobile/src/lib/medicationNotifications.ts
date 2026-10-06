import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Medication } from "@fitness-ai-app/types";

/**
 * Local on-device notifications for medication schedule times, following
 * the same full cancel-and-reschedule strategy as reminderNotifications.ts
 * — but scoped to notifications tagged `data.kind === "medication"` so the
 * two sync passes never wipe each other.
 *
 * Lock-screen copy is deliberately generic (Figma medicine/02 "Lock-screen
 * preview"): no medicine name or dose ever appears outside the app.
 * Weekly-repeating triggers can't express start/end dates, so ended
 * medications are simply not scheduled and a past `startDate` is ignored
 * (a not-yet-started medication still fires; the in-app due list is the
 * source of truth). Unverified on a physical device.
 */
export async function syncMedicationNotifications(medications: Medication[]): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content.data?.kind === "medication") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const med of medications) {
      if (!med.isActive) continue;
      if (med.endDate && med.endDate.slice(0, 10) < today) continue;
      for (const time of med.scheduleTimes) {
        const [h, m] = time.split(":").map((v) => Number(v));
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        for (const jsDay of med.daysOfWeek) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "23PrimeFit",
              body: "You have a scheduled reminder. Open 23PrimeFit to view details.",
              data: { kind: "medication", deepLink: "/medicine/due" },
            },
            trigger: { weekday: jsDay + 1, hour: h, minute: m, repeats: true },
          });
        }
      }
    }
  } catch {
    // Scheduling is best-effort (permission denied, unsupported platform).
  }
}
