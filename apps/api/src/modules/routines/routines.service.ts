import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { startSession } from "../workoutSessions/workoutSessions.service";
import type { CreateRoutineInput, UpdateRoutineInput } from "./routines.schema";

/** Train 13 — user-owned custom routines (strictly user-scoped). */

const MAX_ROUTINES_PER_USER = 50;

type RoutineExerciseRow = {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: number;
  restSeconds: number | null;
  exercise: { name: string; muscleGroup: string; equipment: string };
};
type RoutineRow = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  exercises: RoutineExerciseRow[];
};

const INCLUDE = {
  exercises: {
    orderBy: { order: "asc" as const },
    include: { exercise: { select: { name: true, muscleGroup: true, equipment: true } } },
  },
};

function toRoutine(r: RoutineRow) {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    exercises: r.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      exerciseName: e.exercise.name,
      muscleGroup: e.exercise.muscleGroup,
      equipment: e.exercise.equipment,
      order: e.order,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      restSeconds: e.restSeconds,
    })),
  };
}

async function assertExercisesExist(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await prisma.exercise.count({ where: { id: { in: unique } } });
  if (found !== unique.length) {
    throw new ApiHttpError(400, "exercise_not_found", "One or more exercises could not be found");
  }
}

async function getOwned(userId: string, id: string): Promise<RoutineRow> {
  const routine = await prisma.routine.findFirst({ where: { id, userId }, include: INCLUDE });
  if (!routine) throw new ApiHttpError(404, "routine_not_found", "Routine not found");
  return routine as unknown as RoutineRow;
}

export async function listRoutines(userId: string) {
  const rows = await prisma.routine.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return { items: (rows as unknown as RoutineRow[]).map(toRoutine) };
}

export async function getRoutine(userId: string, id: string) {
  return toRoutine(await getOwned(userId, id));
}

export async function createRoutine(userId: string, input: CreateRoutineInput) {
  const count = await prisma.routine.count({ where: { userId } });
  if (count >= MAX_ROUTINES_PER_USER) {
    throw new ApiHttpError(409, "routine_limit_reached", `You can save up to ${MAX_ROUTINES_PER_USER} routines`);
  }
  await assertExercisesExist(input.exercises.map((e) => e.exerciseId));

  const created = await prisma.routine.create({
    data: {
      userId,
      name: input.name,
      notes: input.notes,
      exercises: {
        create: input.exercises.map((e, order) => ({
          exerciseId: e.exerciseId,
          order,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restSeconds: e.restSeconds ?? null,
        })),
      },
    },
    include: INCLUDE,
  });
  return toRoutine(created as unknown as RoutineRow);
}

export async function updateRoutine(userId: string, id: string, input: UpdateRoutineInput) {
  await getOwned(userId, id);
  if (input.exercises) await assertExercisesExist(input.exercises.map((e) => e.exerciseId));

  const exercises = input.exercises;
  await prisma.$transaction(async (tx) => {
    if (exercises) {
      await tx.routineExercise.deleteMany({ where: { routineId: id } });
      await tx.routineExercise.createMany({
        data: exercises.map((e, order) => ({
          routineId: id,
          exerciseId: e.exerciseId,
          order,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restSeconds: e.restSeconds ?? null,
        })),
      });
    }
    await tx.routine.update({
      where: { id },
      data: { name: input.name, notes: input.notes },
    });
  });
  return getRoutine(userId, id);
}

export async function deleteRoutine(userId: string, id: string) {
  await getOwned(userId, id);
  await prisma.routine.delete({ where: { id } });
  return { deleted: true, id };
}

const PERSONAL_PROGRAM_NAME = "My Routines";

/** The user's private container program (never published / listed anywhere). */
async function ensurePersonalProgram(userId: string): Promise<string> {
  const existing = await prisma.program.findFirst({ where: { ownerUserId: userId }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.program.create({
    data: {
      name: PERSONAL_PROGRAM_NAME,
      type: "fitness",
      description: "Your personal routines",
      durationWeeks: 1,
      isAiOnly: false,
      priceCents: 0,
      status: "draft",
      ownerUserId: userId,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Materialize (or refresh) the routine as a Workout in the user's personal
 * program. The existing Workout is rewritten only when its exercises differ
 * AND no in-progress session is using it; otherwise it is reused as-is.
 */
async function materializeWorkout(userId: string, routine: RoutineRow & { workoutId?: string | null }) {
  const programId = await ensurePersonalProgram(userId);
  const wanted = routine.exercises.map((e, order) => ({
    exerciseId: e.exerciseId,
    order,
    phase: "main" as const,
    targetSets: e.targetSets,
    targetReps: e.targetReps,
  }));
  const durationMinutes = Math.max(10, Math.min(180, wanted.reduce((n, e) => n + e.targetSets * 3, 0)));

  return prisma.$transaction(async (tx) => {
    const existing = routine.workoutId
      ? await tx.workout.findFirst({
          where: { id: routine.workoutId, programId },
          include: { exercises: { orderBy: { order: "asc" } } },
        })
      : null;

    if (!existing) {
      const created = await tx.workout.create({
        data: { programId, name: routine.name, durationMinutes, exercises: { create: wanted } },
        select: { id: true },
      });
      await tx.routine.update({ where: { id: routine.id }, data: { workoutId: created.id } });
      return created.id;
    }

    const same =
      existing.name === routine.name &&
      existing.exercises.length === wanted.length &&
      existing.exercises.every(
        (e: { exerciseId: string; targetSets: number; targetReps: number }, i: number) =>
          e.exerciseId === wanted[i].exerciseId &&
          e.targetSets === wanted[i].targetSets &&
          e.targetReps === wanted[i].targetReps,
      );
    if (!same) {
      const active = await tx.workoutSession.count({ where: { workoutId: existing.id, status: "in_progress" } });
      if (active === 0) {
        await tx.workoutExercise.deleteMany({ where: { workoutId: existing.id } });
        await tx.workoutExercise.createMany({ data: wanted.map((e) => ({ ...e, workoutId: existing.id })) });
        await tx.workout.update({ where: { id: existing.id }, data: { name: routine.name, durationMinutes } });
      }
    }
    return existing.id;
  });
}

/** Start a live workout session from a saved routine (owner only). */
export async function startRoutine(userId: string, id: string) {
  const routine = await getOwned(userId, id);
  if (routine.exercises.length === 0) {
    throw new ApiHttpError(400, "routine_empty", "Add at least one exercise before starting this routine");
  }
  const workoutId = await materializeWorkout(userId, routine as RoutineRow & { workoutId?: string | null });
  const session = await startSession(userId, workoutId);
  return { session, workoutId, sessionId: session.id };
}
