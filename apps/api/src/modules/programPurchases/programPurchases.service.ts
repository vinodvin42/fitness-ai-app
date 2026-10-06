import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * Programs Commerce (docs/mobile/03-screen-inventory.md §I). Phase 3 scope:
 * a real one-off Program purchase that grants access to that program's
 * workouts, plus a "My Programs" list. Deliberately single-tier — no
 * AI-only vs AI+Coach add-on choice (needs Coach infra that doesn't exist
 * until Phase 5) — see docs/mobile/07-open-questions-gaps.md §15. 20 Aug
 * 2026: a real Razorpay integration (`apps/api/src/modules/payments`) now
 * backs the purchase itself — see `purchaseProgram()`'s `verifiedPayment`
 * guard below, same gate/reasoning as Subscription & Payments.
 */

/** Free programs (priceCents === 0) need no purchase at all. */
export async function hasAccess(userId: string, programId: string, priceCents: number): Promise<boolean> {
  if (priceCents === 0) return true;
  const purchase = await prisma.programPurchase.findUnique({
    where: { userId_programId: { userId, programId } },
  });
  return purchase !== null;
}

export async function purchaseProgram(
  userId: string,
  programId: string,
  opts: { verifiedPayment?: boolean } = {},
) {
  const program = await prisma.program.findFirst({ where: { id: programId, ownerUserId: null } });
  if (!program) {
    throw new ApiHttpError(404, "program_not_found", "Program not found");
  }
  if (program.priceCents === 0) {
    throw new ApiHttpError(400, "program_is_free", "This program is free — start a workout, no purchase needed");
  }
  if (!opts.verifiedPayment) {
    throw new ApiHttpError(
      402,
      "payment_required",
      "This program requires payment — create a Razorpay order via POST /payments/razorpay/orders first",
    );
  }

  const existing = await prisma.programPurchase.findUnique({
    where: { userId_programId: { userId, programId } },
  });
  if (existing) {
    return existing; // idempotent — already purchased, nothing new to charge
  }

  const purchase = await prisma.programPurchase.create({
    data: { userId, programId, priceCents: program.priceCents },
  });

  await recordAudit({
    actorId: userId,
    action: "program.purchased",
    entityType: "ProgramPurchase",
    entityId: purchase.id,
    metadata: { programId, priceCents: program.priceCents },
  });

  return purchase;
}

interface MyProgramRow {
  program: {
    id: string;
    name: string;
    type: string;
    description: string;
    durationWeeks: number;
    isAiOnly: boolean;
    priceCents: number;
    createdAt: Date;
  };
  totalWorkouts: number;
  completedWorkouts: number;
  status: "active" | "completed";
  purchasedAt: Date | null;
}

/**
 * "My Programs" — every program this user has purchased, plus every free
 * program they've actually started (a free program only becomes "mine"
 * once engaged with; just existing in the catalog doesn't make it so).
 * NOTE: the loops below use for-of / explicit accumulator types rather than
 * .map()/.filter() directly on Prisma query results — apps/api's stub
 * @prisma/client (see README's "Note on this scaffold") types findMany()
 * results as `any` until `prisma generate` runs, which makes inline arrow
 * callback params implicit-any under this project's strict tsconfig. A
 * real generated client infers this correctly on its own.
 */
export async function listMyPrograms(userId: string): Promise<MyProgramRow[]> {
  const purchases = await prisma.programPurchase.findMany({ where: { userId } });
  const purchasedAtByProgram = new Map<string, Date>();
  for (const purchase of purchases) {
    purchasedAtByProgram.set(purchase.programId, purchase.createdAt);
  }

  const sessions = await prisma.workoutSession.findMany({
    where: { userId },
    include: { workout: { select: { programId: true } } },
  });

  const relevantProgramIds = new Set<string>(purchasedAtByProgram.keys());
  const completedWorkoutIdsByProgram = new Map<string, Set<string>>();
  for (const session of sessions) {
    relevantProgramIds.add(session.workout.programId);
    if (session.status !== "completed") continue;
    const set = completedWorkoutIdsByProgram.get(session.workout.programId) ?? new Set<string>();
    set.add(session.workoutId);
    completedWorkoutIdsByProgram.set(session.workout.programId, set);
  }

  if (relevantProgramIds.size === 0) return [];

  const programs = await prisma.program.findMany({
    where: { id: { in: Array.from(relevantProgramIds) }, ownerUserId: null },
    include: { workouts: { select: { id: true } } },
  });

  const rows: MyProgramRow[] = [];
  for (const program of programs) {
    const totalWorkouts = program.workouts.length;
    const completedWorkouts = completedWorkoutIdsByProgram.get(program.id)?.size ?? 0;
    rows.push({
      program: {
        id: program.id,
        name: program.name,
        type: program.type,
        description: program.description,
        durationWeeks: program.durationWeeks,
        isAiOnly: program.isAiOnly,
        priceCents: program.priceCents,
        createdAt: program.createdAt,
      },
      totalWorkouts,
      completedWorkouts,
      status: totalWorkouts > 0 && completedWorkouts === totalWorkouts ? "completed" : "active",
      purchasedAt: purchasedAtByProgram.get(program.id) ?? null,
    });
  }

  return rows;
}

interface ProgramProgressRow {
  program: MyProgramRow["program"];
  totalWorkouts: number;
  completedWorkouts: number;
  status: "active" | "completed";
  purchasedAt: Date | null;
  startedAt: Date | null;
  lastCompletedAt: Date | null;
  completedThisWeek: number;
  totalSetsLogged: number;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Program Progress / Program Completion (docs/mobile/03-screen-inventory.md
 * §I — the two screens share this one endpoint; which UI the client shows
 * is just `status`). Everything here is computed from real WorkoutSession/
 * ExerciseSetLog data already logged in Phase 1's Training flow — no
 * separate streak/milestone table. Deliberately NOT included: a real
 * "streak" (Streak Tracker is its own unbuilt Phase 2 screen, see gap §13
 * — building a fake one here would duplicate that gap rather than close
 * it), a Timeline, and an AI insight/recommendation (needs the AI Coach
 * decision, also gap §13).
 */
export async function getProgramProgress(userId: string, programId: string): Promise<ProgramProgressRow> {
  const program = await prisma.program.findFirst({
    where: { id: programId, ownerUserId: null },
    include: { workouts: { select: { id: true } } },
  });
  if (!program) {
    throw new ApiHttpError(404, "program_not_found", "Program not found");
  }

  const purchase = await prisma.programPurchase.findUnique({
    where: { userId_programId: { userId, programId } },
  });

  const sessions = await prisma.workoutSession.findMany({
    where: { userId, workout: { programId } },
    include: { setLogs: { select: { id: true } } },
  });

  const totalWorkouts = program.workouts.length;
  const completedWorkoutIds = new Set<string>();
  let startedAt: Date | null = null;
  let lastCompletedAt: Date | null = null;
  let completedThisWeek = 0;
  let totalSetsLogged = 0;
  const weekAgo = new Date(Date.now() - ONE_WEEK_MS);

  for (const session of sessions) {
    totalSetsLogged += session.setLogs.length;
    if (!startedAt || session.startedAt < startedAt) {
      startedAt = session.startedAt;
    }
    if (session.status === "completed") {
      completedWorkoutIds.add(session.workoutId);
      if (session.completedAt && (!lastCompletedAt || session.completedAt > lastCompletedAt)) {
        lastCompletedAt = session.completedAt;
      }
      if (session.completedAt && session.completedAt >= weekAgo) {
        completedThisWeek += 1;
      }
    }
  }

  const completedWorkouts = completedWorkoutIds.size;

  return {
    program: {
      id: program.id,
      name: program.name,
      type: program.type,
      description: program.description,
      durationWeeks: program.durationWeeks,
      isAiOnly: program.isAiOnly,
      priceCents: program.priceCents,
      createdAt: program.createdAt,
    },
    totalWorkouts,
    completedWorkouts,
    status: totalWorkouts > 0 && completedWorkouts === totalWorkouts ? "completed" : "active",
    purchasedAt: purchase?.createdAt ?? null,
    startedAt,
    lastCompletedAt,
    completedThisWeek,
    totalSetsLogged,
  };
}
