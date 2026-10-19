import type { Medication, MedicationDose, MedicationDoseStatus } from "@fitness-ai-app/types";
import { logMedicationDose } from "../api/medications";
import { cancelSnoozeNotification, scheduleSnoozeNotification } from "./medicationNotifications";

/** One snooze length everywhere a dose can be snoozed (Today card and the occurrence screen). */
export const MEDICINE_SNOOZE_MINUTES = 10;

/**
 * Logs Taken / Skipped / Snoozed for one occurrence and keeps the local snooze
 * alert in step: snoozing schedules a fresh alert, anything else cancels it.
 */
export async function logDoseWithReminder(
  medicationId: string,
  scheduledFor: string,
  status: MedicationDoseStatus,
  med: Medication | undefined,
): Promise<MedicationDose> {
  const remindAt = new Date(Date.now() + MEDICINE_SNOOZE_MINUTES * 60_000);
  const saved = await logMedicationDose(medicationId, {
    scheduledFor,
    status,
    snoozedUntil: status === "snoozed" ? remindAt.toISOString() : undefined,
  });
  if (status === "snoozed" && med) await scheduleSnoozeNotification(med, scheduledFor, remindAt);
  else await cancelSnoozeNotification(medicationId, scheduledFor);
  return saved;
}
