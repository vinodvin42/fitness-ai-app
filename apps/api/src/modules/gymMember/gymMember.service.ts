import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { computeOpenState, DAY_KEYS } from "../../lib/gymHours";
import { exerciseAvailability, pickAlternative, type EquipmentLike } from "../../lib/gymEquipment";
import { getNextWorkoutForActivePlan } from "../plans/plans.service";
import { createHelpRequest as createGymHelpRequest } from "../gymPortal/gymPortal.service";
import type { CreateHelpRequestInput } from "./gymMember.schema";

/** Same derivation as the Profile screen's member id. */
export function memberNumberFor(userId: string): string {
  return `PF-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
}

async function linkedContext(userId: string) {
  const link = await prisma.userPartnerLink.findUnique({
    where: { userId },
    include: { gym: { include: { locations: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!link) throw new ApiHttpError(404, "gym_not_linked", "You have not linked a gym yet.");
  return { link, gym: link.gym, location: link.gym.locations[0] ?? null };
}

const scoped = (locationId: string | null) => ({ OR: [{ locationId: null }, ...(locationId ? [{ locationId }] : [])] });

function toEquipmentItem(e: {
  id: string;
  name: string;
  category: string;
  quantity: number | null;
  available: boolean;
  availabilityUpdatedAt: Date;
  note: string | null;
}) {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    quantity: e.quantity,
    available: e.available,
    availabilityUpdatedAt: e.availabilityUpdatedAt.toISOString(),
    note: e.note,
  };
}

/** The latest announcement that has not expired. */
export function activeAnnouncementWhere(gymId: string, now: Date) {
  return { gymId, postedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export async function getMyGym(userId: string, now = new Date()) {
  const { link, gym, location } = await linkedContext(userId);
  const [timings, equipment, announcement] = await Promise.all([
    prisma.gymTiming.findMany({
      where: { gymId: gym.id, ...scoped(location?.id ?? null) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.gymEquipment.findMany({
      where: { gymId: gym.id, ...scoped(location?.id ?? null) },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.gymAnnouncement.findFirst({ where: activeAnnouncementWhere(gym.id, now), orderBy: { postedAt: "desc" } }),
  ]);
  const state = computeOpenState(timings, now, gym.timezone);
  const first = state.todayWindows[0] ?? null;
  const latest = equipment.reduce<Date | null>(
    (m, e) => (!m || e.availabilityUpdatedAt > m ? e.availabilityUpdatedAt : m),
    null,
  );
  return {
    gym: { id: gym.id, name: gym.name, timezone: gym.timezone, active: gym.status === "approved" },
    location: location ? { id: location.id, name: location.name, address: location.address } : null,
    joinedWithCode: link.code,
    linkedAt: link.linkedAt.toISOString(),
    openNow: state.openNow,
    today: {
      day: DAY_KEYS[state.dayIndex],
      closed: state.todayClosed,
      opensAt: first?.opensAt ?? null,
      closesAt: first?.closesAt ?? null,
    },
    announcement: announcement
      ? {
          id: announcement.id,
          title: announcement.title,
          body: announcement.body,
          kind: announcement.kind,
          postedAt: announcement.postedAt.toISOString(),
        }
      : null,
    timings: timings.map((t) => ({
      id: t.id,
      label: t.label,
      days: t.days,
      opensAt: t.opensAt,
      closesAt: t.closesAt,
      closed: t.closed,
      kind: t.kind,
    })),
    equipment: equipment.map(toEquipmentItem),
    equipmentUpdatedAt: latest ? latest.toISOString() : null,
  };
}

const TOPIC_LABEL: Record<string, string> = {
  form_check: "Form check",
  machine_help: "Machine help",
  trainer_available: "Trainer available?",
  other: "Other",
};
const TOPIC_CATEGORY = {
  form_check: "trainer_support",
  machine_help: "equipment",
  trainer_available: "trainer_support",
  other: "other",
} as const;

/**
 * Member asks for help in the gym. Stored on the partner-portal help-request model
 * (GymHelpRequest, which by design keeps NO link to the member - BR-GYM-003) via the
 * gymPortal service, so it shows in the gym's own help queue and the admin action
 * queue. Only the topic, exercise/workout name and note are carried; no member
 * identity, health data, food logs, photos or AI chats.
 */
export async function createHelpRequest(userId: string, input: CreateHelpRequestInput) {
  const { gym, location } = await linkedContext(userId);
  const parts = [`Member asked for help: ${TOPIC_LABEL[input.topic]}.`];
  if (input.exerciseName) parts.push(`Exercise: ${input.exerciseName}.`);
  if (input.workoutName) parts.push(`Workout: ${input.workoutName}.`);
  if (input.note) parts.push(`Note: ${input.note}`);
  const row = await createGymHelpRequest(gym.id, {
    category: TOPIC_CATEGORY[input.topic],
    subject: `Member help request: ${TOPIC_LABEL[input.topic]}`,
    body: parts.join(" "),
    locationId: location?.id ?? null,
  });
  return {
    request: {
      id: row.id,
      topic: input.topic,
      exerciseName: input.exerciseName ?? null,
      workoutName: input.workoutName ?? null,
      note: input.note ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      respondedAt: null,
    },
  };
}

/**
 * The shared help-request model deliberately stores no member link, so a member's own
 * request history cannot be listed server-side; clients keep what they just sent.
 */
export async function listMyHelpRequests(userId: string) {
  await linkedContext(userId);
  return { items: [] as never[] };
}

const PHASE_ORDER = { warmup: 0, main: 1, cooldown: 2 } as const;

/** The user's next planned workout, checked against the gym's equipment. */
export async function getTodayGymWorkout(userId: string) {
  const { gym, location } = await linkedContext(userId);
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { equipmentContext: true } });
  const base = {
    gym: { id: gym.id, name: gym.name, locationName: location?.name ?? null },
    equipmentContext: profile?.equipmentContext ?? null,
  };
  const empty = (emptyReason: "no_plan" | "program_complete" | "no_workout") => ({
    ...base,
    workout: null,
    emptyReason,
    exercises: [] as never[],
    swapSuggestion: null,
    swapSuggestions: [] as never[],
  });

  const next = await getNextWorkoutForActivePlan(userId);
  if (!next) return empty("no_plan");
  if (!next.workout) return empty(next.programComplete ? "program_complete" : "no_workout");

  const [workout, equipmentRows, pool] = await Promise.all([
    prisma.workout.findUnique({
      where: { id: next.workout.id },
      include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
    }),
    prisma.gymEquipment.findMany({ where: { gymId: gym.id, ...scoped(location?.id ?? null) } }),
    prisma.exercise.findMany({ where: { status: "published" }, orderBy: { name: "asc" } }),
  ]);
  if (!workout) return empty("no_workout");

  const equipment: EquipmentLike[] = equipmentRows;
  const inWorkout = new Set(workout.exercises.map((we) => we.exerciseId));
  const taken = new Set(inWorkout);
  const ordered = [...workout.exercises].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.order - b.order);

  const lastLogs = await prisma.exerciseSetLog.findMany({
    where: { exerciseId: { in: [...inWorkout] }, session: { userId }, weightKg: { not: null }, isWarmup: false },
    orderBy: { loggedAt: "desc" },
    select: { exerciseId: true, weightKg: true },
  });
  const lastWeight = new Map<string, number>();
  for (const l of lastLogs) if (!lastWeight.has(l.exerciseId) && l.weightKg != null) lastWeight.set(l.exerciseId, l.weightKg);

  const swapSuggestions: Array<{
    workoutExerciseId: string;
    from: { id: string; name: string };
    to: (typeof pool)[number];
    toEquipmentLabel: string | null;
    unavailableEquipmentName: string;
    updatedAt: string;
    reason: string;
  }> = [];

  const exercises = ordered.map((we) => {
    const a = exerciseAvailability(we.exercise, equipment);
    if (a.status === "unavailable") {
      const alt = pickAlternative(we.exercise, pool, equipment, taken);
      if (alt) {
        taken.add(alt.exercise.id);
        const full = pool.find((p) => p.id === alt.exercise.id)!;
        swapSuggestions.push({
          workoutExerciseId: we.id,
          from: { id: we.exercise.id, name: we.exercise.name },
          to: full,
          toEquipmentLabel: alt.availability.status === "available" ? alt.availability.item.name : null,
          unavailableEquipmentName: a.item.name,
          updatedAt: a.item.availabilityUpdatedAt.toISOString(),
          reason: `${a.item.name} is marked unavailable at this gym.`,
        });
      }
    }
    return {
      workoutExerciseId: we.id,
      exerciseId: we.exercise.id,
      name: we.exercise.name,
      phase: we.phase,
      sets: we.targetSets,
      reps: we.targetReps,
      lastWeightKg: lastWeight.get(we.exercise.id) ?? null,
      equipment: we.exercise.equipment,
      // Where to do it: the gym's own name for the matching equipment.
      equipmentLabel: a.status === "available" || a.status === "unavailable" ? a.item.name : null,
      gymUnavailable: a.status === "unavailable",
      unavailableSince: a.status === "unavailable" ? a.item.availabilityUpdatedAt.toISOString() : null,
    };
  });

  return {
    ...base,
    workout: {
      id: workout.id,
      name: workout.name,
      durationMinutes: workout.durationMinutes,
      mainCount: workout.exercises.filter((e) => e.phase === "main").length,
      otherCount: workout.exercises.filter((e) => e.phase !== "main").length,
    },
    emptyReason: null,
    exercises,
    swapSuggestion: swapSuggestions[0] ?? null,
    swapSuggestions,
  };
}
