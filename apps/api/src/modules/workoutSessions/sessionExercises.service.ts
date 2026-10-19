import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { AddSessionExerciseInput, UpdateSessionExerciseInput } from "./workoutSessions.schema";

/**
 * A workout session's own exercise list (Batch 3a, owner-approved 18 Oct
 * 2026; Figma 03b fast logging). The workout's WorkoutExercise rows are a
 * shared template, so per-session changes — a swap that survives an app
 * restart, "+ Add exercise", supersets, removing an untouched exercise — live
 * in WorkoutSessionExercise. Rows are copied from the template when the
 * session starts; sessions started before this existed are copied on first
 * read or edit while still in progress. `WorkoutSession.currentExerciseIndex`
 * indexes this list (0-based `order`).
 *
 * Set logs stay keyed by exerciseId, so an exercise appears in a session's
 * list at most once, and an entry can only be swapped or removed before any
 * of its sets are logged.
 */

const PHASE_RANK: Record<string, number> = { warmup: 0, main: 1, cooldown: 2 };
/** Rest used when the user has neither a per-exercise choice nor a settings row (WorkoutSettings default). */
const DEFAULT_REST_SECONDS = 90;

type Tx = Prisma.TransactionClient;

type TemplateRow = { id: string; exerciseId: string; phase: string; order: number; targetSets: number; targetReps: number };

/** Template rows in the order the app has always shown them: warm-up, main, cool-down, then `order`. */
function sortTemplate(rows: TemplateRow[]): TemplateRow[] {
  return [...rows].sort((a, b) => (PHASE_RANK[a.phase] ?? 1) - (PHASE_RANK[b.phase] ?? 1) || a.order - b.order);
}

/**
 * Copies the workout's template into the session's list unless it already has
 * one. Locks the session row first so two concurrent first reads/edits can't
 * both copy it.
 */
export async function ensureSessionExercises(tx: Tx, sessionId: string, workoutId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "workout_sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
  const existing = await tx.workoutSessionExercise.count({ where: { sessionId } });
  if (existing > 0) return;
  const template: TemplateRow[] = await tx.workoutExercise.findMany({
    where: { workoutId },
    select: { id: true, exerciseId: true, phase: true, order: true, targetSets: true, targetReps: true },
  });
  const ordered = sortTemplate(template);
  if (ordered.length === 0) return;
  await tx.workoutSessionExercise.createMany({
    data: ordered.map((t, i) => ({
      sessionId,
      exerciseId: t.exerciseId,
      workoutExerciseId: t.id,
      order: i,
      phase: t.phase as "warmup" | "main" | "cooldown",
      targetSets: t.targetSets,
      targetReps: t.targetReps,
      source: "plan" as const,
    })),
  });
}

const EXERCISE_SELECT = {
  id: true,
  name: true,
  muscleGroup: true,
  equipment: true,
  difficulty: true,
  mediaUrl: true,
  instructions: true,
  status: true,
  createdByAdminId: true,
  updatedAt: true,
} as const;

type ListRow = {
  id: string | null;
  exerciseId: string;
  workoutExerciseId: string | null;
  order: number;
  phase: string;
  targetSets: number;
  targetReps: number;
  supersetGroup: string | null;
  source: string;
  exercise: { id: string; [k: string]: unknown };
};

/**
 * The list as the client reads it, each entry with its rest seconds resolved
 * (the user's choice for that exercise, else their settings default). A
 * finished legacy session with no rows gets the template, read-only (`id` null).
 */
export async function listSessionExercises(session: { id: string; userId: string; workoutId: string; status: string }) {
  if (session.status === "in_progress") {
    await prisma.$transaction((tx) => ensureSessionExercises(tx, session.id, session.workoutId));
  }
  let rows: ListRow[] = await prisma.workoutSessionExercise.findMany({
    where: { sessionId: session.id },
    orderBy: { order: "asc" },
    include: { exercise: { select: EXERCISE_SELECT } },
  });
  if (rows.length === 0) {
    const template = await prisma.workoutExercise.findMany({
      where: { workoutId: session.workoutId },
      include: { exercise: { select: EXERCISE_SELECT } },
    });
    rows = sortTemplate(template).map((t, i) => {
      const full = template.find((x) => x.id === t.id)!;
      return {
        id: null,
        exerciseId: t.exerciseId,
        workoutExerciseId: t.id,
        order: i,
        phase: t.phase,
        targetSets: t.targetSets,
        targetReps: t.targetReps,
        supersetGroup: null,
        source: "plan",
        exercise: full.exercise,
      };
    });
  }

  const [prefs, settings] = await Promise.all([
    prisma.exerciseRestPreference.findMany({
      where: { userId: session.userId, exerciseId: { in: rows.map((r) => r.exerciseId) } },
      select: { exerciseId: true, restSeconds: true },
    }),
    prisma.workoutSettings.findUnique({ where: { userId: session.userId }, select: { restTimerSeconds: true } }),
  ]);
  const restByExercise = new Map(prefs.map((p) => [p.exerciseId, p.restSeconds] as const));
  const fallback = settings?.restTimerSeconds ?? DEFAULT_REST_SECONDS;

  return rows.map((r) => ({
    id: r.id,
    exerciseId: r.exerciseId,
    workoutExerciseId: r.workoutExerciseId,
    order: r.order,
    phase: r.phase,
    targetSets: r.targetSets,
    targetReps: r.targetReps,
    supersetGroup: r.supersetGroup,
    source: r.source,
    restSeconds: restByExercise.get(r.exerciseId) ?? fallback,
    exercise: r.exercise,
  }));
}

async function getEditableSession(sessionId: string, userId: string) {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw new ApiHttpError(404, "session_not_found", "Workout session not found");
  }
  if (session.status !== "in_progress") {
    throw new ApiHttpError(409, "session_not_active", "This workout session is no longer in progress");
  }
  return session;
}

async function assertPublishedExercise(tx: Tx, exerciseId: string) {
  const exercise = await tx.exercise.findUnique({ where: { id: exerciseId }, select: { status: true } });
  if (!exercise || exercise.status !== "published") {
    throw new ApiHttpError(404, "exercise_not_found", "Exercise not found");
  }
}

async function assertNotInList(tx: Tx, sessionId: string, exerciseId: string) {
  const dup = await tx.workoutSessionExercise.findFirst({ where: { sessionId, exerciseId }, select: { id: true } });
  if (dup) throw new ApiHttpError(409, "exercise_already_in_session", "That exercise is already in this workout");
}

async function assertNoSets(tx: Tx, sessionId: string, exerciseId: string) {
  const logged = await tx.exerciseSetLog.count({ where: { sessionId, exerciseId } });
  if (logged > 0) {
    throw new ApiHttpError(409, "exercise_has_sets", "Sets are already logged for this exercise");
  }
}

/**
 * Renumbers 0..n-1 in the given order and clears superset letters that are
 * left with one exercise. `keepGroup` is the letter this request just
 * assigned: a superset is linked in two steps (the first exercise gets the
 * letter, then its partner joins), so a brand-new one-member group must
 * survive until the partner joins. A group left with one member by an
 * unlink, a move or a removal is still cleared.
 */
async function normalise(tx: Tx, sessionId: string, orderedIds: string[], keepGroup: string | null = null) {
  for (let i = 0; i < orderedIds.length; i++) {
    await tx.workoutSessionExercise.update({ where: { id: orderedIds[i] }, data: { order: i } });
  }
  const groups = await tx.workoutSessionExercise.groupBy({
    by: ["supersetGroup"],
    where: { sessionId, supersetGroup: { not: null } },
    _count: { _all: true },
  });
  const lonely = groups
    .filter((g) => g._count._all < 2 && g.supersetGroup !== keepGroup)
    .map((g) => g.supersetGroup as string);
  if (lonely.length > 0) {
    await tx.workoutSessionExercise.updateMany({ where: { sessionId, supersetGroup: { in: lonely } }, data: { supersetGroup: null } });
  }
}

async function currentIds(tx: Tx, sessionId: string): Promise<string[]> {
  const rows = await tx.workoutSessionExercise.findMany({ where: { sessionId }, orderBy: { order: "asc" }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** "+ Add exercise": appended to the end of the list. */
export async function addSessionExercise(sessionId: string, userId: string, input: AddSessionExerciseInput) {
  const session = await getEditableSession(sessionId, userId);
  await prisma.$transaction(async (tx) => {
    await ensureSessionExercises(tx, session.id, session.workoutId);
    await assertPublishedExercise(tx, input.exerciseId);
    await assertNotInList(tx, session.id, input.exerciseId);
    const count = await tx.workoutSessionExercise.count({ where: { sessionId: session.id } });
    await tx.workoutSessionExercise.create({
      data: {
        sessionId: session.id,
        exerciseId: input.exerciseId,
        order: count,
        phase: "main",
        targetSets: input.targetSets ?? 3,
        targetReps: input.targetReps ?? 10,
        source: "added",
      },
    });
  });
  return listSessionExercises(session);
}

/** Swap, superset link/unlink, targets, or move to a new position. */
export async function updateSessionExercise(
  sessionId: string,
  sessionExerciseId: string,
  userId: string,
  input: UpdateSessionExerciseInput,
) {
  const session = await getEditableSession(sessionId, userId);
  await prisma.$transaction(async (tx) => {
    await ensureSessionExercises(tx, session.id, session.workoutId);
    const entry = await tx.workoutSessionExercise.findUnique({ where: { id: sessionExerciseId } });
    if (!entry || entry.sessionId !== session.id) {
      throw new ApiHttpError(404, "session_exercise_not_found", "Exercise not found in this workout");
    }
    const data: Prisma.WorkoutSessionExerciseUpdateInput = {};
    if (input.exerciseId !== undefined && input.exerciseId !== entry.exerciseId) {
      await assertNoSets(tx, session.id, entry.exerciseId);
      await assertPublishedExercise(tx, input.exerciseId);
      await assertNotInList(tx, session.id, input.exerciseId);
      data.exercise = { connect: { id: input.exerciseId } };
      if (entry.source === "plan") data.source = "swapped";
    }
    if (input.supersetGroup !== undefined) data.supersetGroup = input.supersetGroup;
    if (input.targetSets !== undefined) data.targetSets = input.targetSets;
    if (input.targetReps !== undefined) data.targetReps = input.targetReps;
    if (Object.keys(data).length > 0) await tx.workoutSessionExercise.update({ where: { id: entry.id }, data });

    const ids = (await currentIds(tx, session.id)).filter((id) => id !== entry.id);
    const at = input.order !== undefined ? Math.min(input.order, ids.length) : entry.order;
    ids.splice(Math.min(at, ids.length), 0, entry.id);
    await normalise(tx, session.id, ids, typeof input.supersetGroup === "string" ? input.supersetGroup : null);
  });
  return listSessionExercises(session);
}

/** "Remove": only before any of that exercise's sets are logged. Keeps the user on the same exercise. */
export async function removeSessionExercise(sessionId: string, sessionExerciseId: string, userId: string) {
  const session = await getEditableSession(sessionId, userId);
  await prisma.$transaction(async (tx) => {
    await ensureSessionExercises(tx, session.id, session.workoutId);
    const entry = await tx.workoutSessionExercise.findUnique({ where: { id: sessionExerciseId } });
    if (!entry || entry.sessionId !== session.id) {
      throw new ApiHttpError(404, "session_exercise_not_found", "Exercise not found in this workout");
    }
    await assertNoSets(tx, session.id, entry.exerciseId);
    await tx.workoutSessionExercise.delete({ where: { id: entry.id } });
    const ids = await currentIds(tx, session.id);
    await normalise(tx, session.id, ids);
    let index = session.currentExerciseIndex;
    if (index > entry.order) index -= 1;
    index = Math.max(0, Math.min(index, ids.length - 1));
    if (index !== session.currentExerciseIndex) {
      await tx.workoutSession.update({ where: { id: session.id }, data: { currentExerciseIndex: index } });
    }
  });
  return listSessionExercises(session);
}
