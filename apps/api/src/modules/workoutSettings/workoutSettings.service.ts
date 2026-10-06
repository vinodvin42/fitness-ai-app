import { prisma } from "../../db/prisma";
import type { UpdateWorkoutSettingsInput } from "./workoutSettings.schema";

/** Train 16 — one settings row per user, created with defaults on first read. */

type SettingsRow = {
  restTimerSeconds: number;
  autoStartRest: boolean;
  weightUnit: string;
  countdownSound: boolean;
  keepScreenAwake: boolean;
  defaultRpeTracking: boolean;
};

function toSettings(r: SettingsRow) {
  return {
    restTimerSeconds: r.restTimerSeconds,
    autoStartRest: r.autoStartRest,
    weightUnit: r.weightUnit as "kg" | "lb",
    countdownSound: r.countdownSound,
    keepScreenAwake: r.keepScreenAwake,
    defaultRpeTracking: r.defaultRpeTracking,
  };
}

export async function getWorkoutSettings(userId: string) {
  const row = await prisma.workoutSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  return toSettings(row as SettingsRow);
}

export async function updateWorkoutSettings(userId: string, input: UpdateWorkoutSettingsInput) {
  const row = await prisma.workoutSettings.upsert({
    where: { userId },
    update: input,
    create: { userId, ...input },
  });
  return toSettings(row as SettingsRow);
}
