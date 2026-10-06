import { prisma } from "../../db/prisma";
import { TRAINING_DAYS, type UpdateWorkoutSettingsInput } from "./workoutSettings.schema";

/**
 * Train 16 — one settings row per user, created with defaults on first read.
 *
 * `equipment` and `trainingDays` overlap with the onboarding profile
 * (`equipmentContext`, `preferredTrainingDays`). While the settings row has
 * nothing of its own, reads fall back to what onboarding captured; edits are
 * written back to the profile so the two never disagree.
 */

type SettingsRow = {
  restTimerSeconds: number;
  autoStartRest: boolean;
  weightUnit: string;
  countdownSound: boolean;
  keepScreenAwake: boolean;
  defaultRpeTracking: boolean;
  preferredDurationMinutes: number;
  audioCoaching: boolean;
  autoDeloadWeek: boolean;
  equipment: string[];
  trainingDays: string[];
};

type Profile = { equipmentContext: string | null; preferredTrainingDays: string[]; sessionLengthMinutes: number | null } | null;

const CONTEXT_EQUIPMENT: Record<string, string[]> = {
  full_gym: ["barbell", "dumbbells", "cables", "machines", "bodyweight"],
  home_dumbbells_bands: ["dumbbells", "bands", "bodyweight"],
  home_bodyweight_only: ["bodyweight"],
  none_travel: ["bodyweight"],
};

/** Equipment chips implied by the onboarding equipment context. */
export function equipmentFromContext(ctx: string | null | undefined): string[] {
  return ctx ? [...(CONTEXT_EQUIPMENT[ctx] ?? [])] : [];
}

/** Coarsest onboarding context that matches a chip selection (null when nothing selected). */
export function contextFromEquipment(equipment: string[]): string | null {
  if (equipment.length === 0) return null;
  const has = (e: string) => equipment.includes(e);
  if (has("barbell") || has("cables") || has("machines")) return "full_gym";
  if (has("dumbbells") || has("bands") || has("kettlebells")) return "home_dumbbells_bands";
  return "home_bodyweight_only";
}

function sortDays(days: string[]): string[] {
  return TRAINING_DAYS.filter((d) => days.includes(d));
}

function toSettings(r: SettingsRow, profile: Profile) {
  const equipment = r.equipment.length > 0 ? r.equipment : equipmentFromContext(profile?.equipmentContext);
  const trainingDays = r.trainingDays.length > 0 ? sortDays(r.trainingDays) : sortDays(profile?.preferredTrainingDays ?? []);
  return {
    restTimerSeconds: r.restTimerSeconds,
    autoStartRest: r.autoStartRest,
    weightUnit: r.weightUnit as "kg" | "lb",
    countdownSound: r.countdownSound,
    keepScreenAwake: r.keepScreenAwake,
    defaultRpeTracking: r.defaultRpeTracking,
    preferredDurationMinutes: r.preferredDurationMinutes,
    audioCoaching: r.audioCoaching,
    autoDeloadWeek: r.autoDeloadWeek,
    equipment,
    trainingDays,
  };
}

async function loadProfile(userId: string): Promise<Profile> {
  const p = await prisma.onboardingProfile.findUnique({
    where: { userId },
    select: { equipmentContext: true, preferredTrainingDays: true, sessionLengthMinutes: true },
  });
  return (p as Profile) ?? null;
}

export async function getWorkoutSettings(userId: string) {
  const profile = await loadProfile(userId);
  const row = await prisma.workoutSettings.upsert({
    where: { userId },
    update: {},
    create: { userId, preferredDurationMinutes: clampDuration(profile?.sessionLengthMinutes) },
  });
  return toSettings(row as SettingsRow, profile);
}

function clampDuration(n: number | null | undefined): number {
  return n ? Math.min(120, Math.max(15, n)) : 45;
}

export async function updateWorkoutSettings(userId: string, input: UpdateWorkoutSettingsInput) {
  const data = {
    ...input,
    ...(input.trainingDays ? { trainingDays: sortDays(input.trainingDays) } : {}),
  };
  const before = await loadProfile(userId);
  const row = await prisma.workoutSettings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  // Keep the onboarding profile's overlapping values in step (only if a profile exists).
  if (before) {
    const profileData: Record<string, unknown> = {};
    if (input.trainingDays) {
      profileData.preferredTrainingDays = sortDays(input.trainingDays);
      if (input.trainingDays.length > 0) profileData.trainingDaysPerWeek = input.trainingDays.length;
    }
    if (input.equipment) {
      const prevCtx = contextFromEquipment(equipmentFromContext(before.equipmentContext));
      const nextCtx = contextFromEquipment(input.equipment);
      // Don't flatten a more specific context (e.g. none_travel) unless the user's choice actually changes its meaning.
      if (nextCtx && nextCtx !== prevCtx) profileData.equipmentContext = nextCtx;
    }
    if (input.preferredDurationMinutes) profileData.sessionLengthMinutes = input.preferredDurationMinutes;
    if (Object.keys(profileData).length > 0) {
      await prisma.onboardingProfile.update({ where: { userId }, data: profileData });
    }
  }
  const profile = await loadProfile(userId);
  return toSettings(row as SettingsRow, profile);
}
