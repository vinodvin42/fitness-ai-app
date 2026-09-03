import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { hasAccess } from "../programPurchases/programPurchases.service";
import { getStreaks } from "../progress/progress.service";
import { LogSetInput } from "./workoutSessions.schema";

/**
 * The Active Workout loop (docs/mobile/03-screen-inventory.md §C trn-07):
 * start a session, log sets as the user works through the exercise list,
 * complete it. `logSet` also backs the dedicated Set/Rest Tracker screen
 * (trn-08) added later in Phase 1 — same endpoint, same `ExerciseSetLog`
 * row, just with isWarmup/isDropSet/note optionally set and a real RPE
 * value instead of the plain form leaving those unset. Still not built:
 * RPE-driven AI suggestions or exercise-swap (a later Train screen). The
 * rest timer itself is deliberately NOT server state — it's a client-side
 * countdown only (see apps/user-mobile's RestTimer component); no
 * "rest seconds taken" is persisted anywhere, see gap §24.
 *
 * Phase 3 (§I Programs Commerce) added a real entitlement check here: a
 * priced program's workouts can't be started until the user has bought it
 * (../programPurchases). This is the one place that check has to be
 * server-enforced — the mobile client also checks `purchased` up front (see
 * ProgramDetailScreen/WorkoutDetailScreen) to show a Purchase prompt
 * instead of a broken "Start Workout" button, but this is the real gate.
 *
 * Also (19 Aug 2026): getSessionSummary — real totals, new-PR detection,
 * and the current training streak for Workout Complete, see its own
 * comment below.
 *
 * 20 Aug 2026: abandonSession — closes half of gap §33. `"abandoned"` has
 * always been a valid `WorkoutSessionStatus`, but nothing ever set it: no
 * explicit UI action, no background job. Gap §33 named two ways to make it
 * real — "a button on Active Workout, or a background job that
 * auto-abandons sessions inactive past some threshold" — and explicitly
 * flagged that inventing a staleness threshold for the second option
 * wasn't this pass's call to make (that's a real product policy: how many
 * hours/days of inactivity counts as "abandoned"?). The first option has
 * no such judgment call — it's an explicit, user-initiated action, exactly
 * like completeSession — so only that half is built here. A background
 * auto-abandon job remains a real, separate, still-open gap (see the
 * updated §33 note).
 */

export async function startSession(userId: string, workoutId: string) {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { program: { select: { id: true, priceCents: true } } },
  });
  if (!workout) {
    throw new ApiHttpError(404, "workout_not_found", "Workout not found");
  }

  if (!(await hasAccess(userId, workout.program.id, workout.program.priceCents))) {
    throw new ApiHttpError(402, "program_not_purchased", "Purchase this program before starting its workouts");
  }

  const session = await prisma.workoutSession.create({
    data: { userId, workoutId },
  });

  await recordAudit({
    actorId: userId,
    action: "workout_session.started",
    entityType: "WorkoutSession",
    entityId: session.id,
    metadata: { workoutId },
  });

  return session;
}

async function getOwnedSession(sessionId: string, userId: string) {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    // 404, not 403 — don't reveal that a session ID belongs to someone else.
    throw new ApiHttpError(404, "session_not_found", "Workout session not found");
  }
  return session;
}

export async function logSet(sessionId: string, userId: string, input: LogSetInput) {
  const session = await getOwnedSession(sessionId, userId);
  if (session.status !== "in_progress") {
    throw new ApiHttpError(409, "session_not_active", "This workout session is no longer in progress");
  }

  return prisma.exerciseSetLog.create({
    data: { sessionId: session.id, ...input },
  });
}

export async function completeSession(sessionId: string, userId: string) {
  const session = await getOwnedSession(sessionId, userId);

  const updated = await prisma.workoutSession.update({
    where: { id: session.id },
    data: { status: "completed", completedAt: new Date() },
    include: { setLogs: true },
  });

  await recordAudit({
    actorId: userId,
    action: "workout_session.completed",
    entityType: "WorkoutSession",
    entityId: session.id,
    metadata: { setCount: updated.setLogs.length },
  });

  return updated;
}

export async function abandonSession(sessionId: string, userId: string) {
  const session = await getOwnedSession(sessionId, userId);
  if (session.status !== "in_progress") {
    throw new ApiHttpError(409, "session_not_active", "This workout session is no longer in progress");
  }

  const updated = await prisma.workoutSession.update({
    where: { id: session.id },
    data: { status: "abandoned", completedAt: new Date() },
  });

  await recordAudit({
    actorId: userId,
    action: "workout_session.abandoned",
    entityType: "WorkoutSession",
    entityId: session.id,
    metadata: {},
  });

  return updated;
}

export async function getSession(sessionId: string, userId: string) {
  await getOwnedSession(sessionId, userId);
  return prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: { setLogs: { orderBy: { loggedAt: "asc" } } },
  });
}

// Workout History (docs/mobile/03-screen-inventory.md §C trn-11): every
// session this user has ever started (in-progress or completed), most
// recent first, with real per-session totals computed here rather than
// re-derived client-side from raw setLogs every render. The monthly-stats
// summary and calendar heatmap the screen also shows are both computed
// client-side from this same list — no separate summary endpoint, same
// pattern as Timeline Month grouping Timeline Overview's events client-side.
export async function listHistory(userId: string) {
  const sessions = await prisma.workoutSession.findMany({
    where: { userId },
    include: {
      setLogs: true,
      workout: { select: { id: true, name: true, program: { select: { name: true } } } },
    },
    orderBy: { startedAt: "desc" },
  });

  // Explicit param type below (matching the `include` shape above) because
  // the Prisma-stub sandbox limitation (see apps/api/README.md's "Note on
  // this scaffold") leaves `findMany`'s inferred element type too loose for
  // `.map`/`.reduce` callbacks here — same workaround already used in
  // progress.service.ts's own findMany + map.
  return sessions.map(
    (s: {
      id: string;
      status: string;
      startedAt: Date;
      completedAt: Date | null;
      setLogs: { weightKg: number | null; reps: number }[];
      workout: { id: string; name: string; program: { name: string } };
    }) => {
      const totalSets = s.setLogs.length;
      const totalVolumeKg = s.setLogs.reduce((sum, log) => sum + (log.weightKg ?? 0) * log.reps, 0);
      const durationMinutes = s.completedAt
        ? Math.round((s.completedAt.getTime() - s.startedAt.getTime()) / 60000)
        : null;
      return {
        id: s.id,
        workoutId: s.workout.id,
        workoutName: s.workout.name,
        programName: s.workout.program.name,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationMinutes,
        totalSets,
        totalVolumeKg,
      };
    },
  );
}

// Workout Complete (trn-10, docs/mobile/03-screen-inventory.md §C): real
// session totals (same calc as listHistory above), any new Personal Records
// set specifically DURING this session (this session's best-per-exercise
// beating whatever was this user's best on that exercise BEFORE this
// session started — not just "is a PR right now", which would also catch
// PRs from earlier sessions), and the user's real current training streak
// (reusing progress.service.ts's getStreaks — same cross-module reuse
// precedent as timeline.service.ts reusing getPersonalRecords). Warm-up
// sets are NOT excluded from the PR comparison, matching the exact same
// "heaviest logged set" definition progress.service.ts's getPersonalRecords
// already uses everywhere else (Progress Overview, Timeline) — this
// doesn't introduce a second, stricter definition of "PR" that could
// disagree with those. Not built: a heart-rate distribution chart (needs
// wearable data, gap §13/§E).
export async function getSessionSummary(sessionId: string, userId: string) {
  await getOwnedSession(sessionId, userId);

  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: { setLogs: { include: { exercise: true } } },
  });
  if (!session) {
    throw new ApiHttpError(404, "session_not_found", "Workout session not found");
  }

  // Explicit param types below — same Prisma-stub sandbox workaround used
  // throughout this file and progress.service.ts (see either's comments).
  const setLogs: Array<{
    exerciseId: string;
    exercise: { name: string };
    weightKg: number | null;
    reps: number;
  }> = session.setLogs;

  const totalSets = setLogs.length;
  const totalVolumeKg = setLogs.reduce((sum: number, log) => sum + (log.weightKg ?? 0) * log.reps, 0);
  const durationMinutes = session.completedAt
    ? Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 60000)
    : null;

  // Best weight logged for each exercise IN this session.
  const sessionBestByExercise = new Map<string, { exerciseId: string; exerciseName: string; weightKg: number; reps: number }>();
  for (const log of setLogs) {
    if (log.weightKg == null) continue;
    const current = sessionBestByExercise.get(log.exerciseId);
    if (!current || log.weightKg > current.weightKg) {
      sessionBestByExercise.set(log.exerciseId, {
        exerciseId: log.exerciseId,
        exerciseName: log.exercise.name,
        weightKg: log.weightKg,
        reps: log.reps,
      });
    }
  }

  // Best weight logged for those same exercises BEFORE this session, across
  // every other session this user has ever done.
  const priorLogs: Array<{ exerciseId: string; weightKg: number | null }> = await prisma.exerciseSetLog.findMany({
    where: {
      session: { userId, id: { not: sessionId } },
      exerciseId: { in: Array.from(sessionBestByExercise.keys()) },
      weightKg: { not: null },
    },
    select: { exerciseId: true, weightKg: true },
  });

  const priorBestByExercise = new Map<string, number>();
  for (const log of priorLogs) {
    if (log.weightKg == null) continue;
    const current = priorBestByExercise.get(log.exerciseId);
    if (current == null || log.weightKg > current) {
      priorBestByExercise.set(log.exerciseId, log.weightKg);
    }
  }

  const newPersonalRecords = Array.from(sessionBestByExercise.values()).filter((best) => {
    const priorBest = priorBestByExercise.get(best.exerciseId);
    return priorBest == null || best.weightKg > priorBest;
  });

  const streaks = await getStreaks(userId);
  const trainingStreak = streaks.categories.find((c) => c.category === "training");

  return {
    totalSets,
    totalVolumeKg,
    durationMinutes,
    newPersonalRecords,
    trainingStreak: {
      currentStreak: trainingStreak?.currentStreak ?? 0,
      longestStreak: trainingStreak?.longestStreak ?? 0,
    },
  };
}
