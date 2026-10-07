import { prisma } from "../../db/prisma";
import { UpdateNotificationPreferencesInput } from "./notificationPreferences.schema";

/** Per-user notification preferences; a default row is created on first read. */

type PrefRow = {
  workoutReminders: boolean;
  mealReminders: boolean;
  coachMessages: boolean;
  billing: boolean;
  marketing: boolean;
  masterEnabled: boolean;
  hydrationReminders: boolean;
  frequencyCap: number | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: Date;
};

function toItem(p: PrefRow) {
  return {
    workoutReminders: p.workoutReminders,
    mealReminders: p.mealReminders,
    coachMessages: p.coachMessages,
    billing: p.billing,
    marketing: p.marketing,
    masterEnabled: p.masterEnabled,
    hydrationReminders: p.hydrationReminders,
    frequencyCap: p.frequencyCap,
    quietHoursStart: p.quietHoursStart,
    quietHoursEnd: p.quietHoursEnd,
    updatedAt: p.updatedAt,
  };
}

export async function getPreferences(userId: string) {
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return toItem(row as PrefRow);
}

export async function updatePreferences(userId: string, input: UpdateNotificationPreferencesInput) {
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  return toItem(row as PrefRow);
}
