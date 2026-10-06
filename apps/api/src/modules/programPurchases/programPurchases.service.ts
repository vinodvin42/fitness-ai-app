import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  buildWeekSchedule,
  computeAdherencePercent,
  currentProgramWeek,
  pickMeasurementChange,
  plannedPerWeek,
  programWeekWindow,
  type WeekScheduleItem,
} from "./programProgress.logic";

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
  /** First session start; null if never started. */
  startedAt: Date | null;
  /** Latest completed session; null if none. */
  lastCompletedAt: Date | null;
  /** 1-based program week (capped at durationWeeks); null if not started. */
  weekNumber: number | null;
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
  const startedAtByProgram = new Map<string, Date>();
  const lastCompletedByProgram = new Map<string, Date>();
  for (const session of sessions) {
    relevantProgramIds.add(session.workout.programId);
    const prevStart = startedAtByProgram.get(session.workout.programId);
    if (!prevStart || session.startedAt < prevStart) startedAtByProgram.set(session.workout.programId, session.startedAt);
    if (session.status === "completed" && session.completedAt) {
      const prevEnd = lastCompletedByProgram.get(session.workout.programId);
      if (!prevEnd || session.completedAt > prevEnd) lastCompletedByProgram.set(session.workout.programId, session.completedAt);
    }
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
      startedAt: startedAtByProgram.get(program.id) ?? null,
      lastCompletedAt: lastCompletedByProgram.get(program.id) ?? null,
      weekNumber: startedAtByProgram.has(program.id)
        ? currentProgramWeek(startedAtByProgram.get(program.id)!, program.durationWeeks, new Date())
        : null,
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
  /** Figma Programs 02/03 additions - every number is derived, see programProgress.logic.ts. */
  weekNumber: number | null;
  plannedPerWeek: number;
  /** Completed sessions inside the current program week window. */
  completedSessionsThisWeek: number;
  schedule: WeekScheduleItem[];
  /** Days (of those elapsed this program week) with at least one meal logged; null when no meals were logged this week. */
  nutritionLoggedDays: { logged: number; elapsed: number } | null;
  /** Completed sessions / (plannedPerWeek x weeks spanned), capped at 100; null if nothing completed. */
  adherencePercent: number | null;
  /** Weight / body-fat change inside the program window; null when fewer than two logged values exist. */
  weight: { startKg: number; currentKg: number } | null;
  bodyFat: { startPercent: number; currentPercent: number } | null;
  /** Only set when the program is completed. */
  nextProgram: NextProgramRecommendation | null;
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
    include: { workouts: { select: { id: true, name: true, order: true }, orderBy: { order: "asc" } } },
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
  const profile = await prisma.onboardingProfile.findUnique({
    where: { userId },
    select: { trainingDaysPerWeek: true, preferredTrainingDays: true },
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

  // ---- Figma Programs 02/03 derived data (see programProgress.logic.ts) ----
  const now = new Date();
  const preferredDays = (profile?.preferredTrainingDays ?? []) as string[];
  const planned = plannedPerWeek(totalWorkouts, profile?.trainingDaysPerWeek ?? null, preferredDays.length);
  const weekNumber = startedAt ? currentProgramWeek(startedAt, program.durationWeeks, now) : null;
  const window = startedAt && weekNumber ? programWeekWindow(startedAt, weekNumber) : null;
  const completedInWeek = window
    ? sessions.filter(
        (x: { status: string; completedAt: Date | null }) =>
          x.status === "completed" && x.completedAt && x.completedAt >= window.start && x.completedAt < window.end,
      )
    : [];
  const doneWorkoutIdsThisWeek = new Set<string>(completedInWeek.map((x: { workoutId: string }) => x.workoutId));
  const schedule = buildWeekSchedule(program.workouts, planned, weekNumber ?? 1, preferredDays, doneWorkoutIdsThisWeek);

  let nutritionLoggedDays: { logged: number; elapsed: number } | null = null;
  if (window) {
    const meals = await prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: window.start, lt: window.end } },
      select: { loggedAt: true },
    });
    if (meals.length > 0) {
      const days = new Set<string>(meals.map((m: { loggedAt: Date }) => m.loggedAt.toISOString().slice(0, 10)));
      const elapsed = Math.min(7, Math.max(1, Math.ceil((now.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000))));
      nutritionLoggedDays = { logged: Math.min(days.size, elapsed), elapsed };
    }
  }

  let weight: ProgramProgressRow["weight"] = null;
  let bodyFat: ProgramProgressRow["bodyFat"] = null;
  let adherencePercent: number | null = null;
  if (startedAt) {
    const endAt: Date = totalWorkouts > 0 && completedWorkouts === totalWorkouts && lastCompletedAt ? lastCompletedAt : now;
    const measurements = await prisma.bodyMeasurement.findMany({
      where: { userId, loggedAt: { gte: new Date(startedAt.getTime() - ONE_WEEK_MS), lte: new Date(endAt.getTime() + 24 * 60 * 60 * 1000) } },
      orderBy: { loggedAt: "asc" },
      select: { weightKg: true, bodyFatPercent: true, loggedAt: true },
    });
    const w = pickMeasurementChange(measurements, "weightKg");
    weight = w ? { startKg: w.start, currentKg: w.current } : null;
    const bf = pickMeasurementChange(measurements, "bodyFatPercent");
    bodyFat = bf ? { startPercent: bf.start, currentPercent: bf.current } : null;
    const completedSessionCount = sessions.filter((x: { status: string }) => x.status === "completed").length;
    adherencePercent = computeAdherencePercent(completedSessionCount, planned, startedAt, endAt, program.durationWeeks);
  }

  return {
    weekNumber,
    plannedPerWeek: planned,
    completedSessionsThisWeek: completedInWeek.length,
    schedule,
    nutritionLoggedDays,
    adherencePercent,
    weight,
    bodyFat,
    nextProgram:
      totalWorkouts > 0 && completedWorkouts === totalWorkouts
        ? await getNextProgramRecommendation(userId, { id: program.id, type: program.type })
        : null,
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

export interface NextProgramRecommendation {
  id: string;
  name: string;
  durationWeeks: number;
  /** "plan" = the program the user's latest generated plan is built on; "catalog" = next unstarted published program (same type first). */
  source: "plan" | "catalog";
}

/**
 * Recommendation shown on Program Complete. Prefers the program the plan
 * engine selected for the user (latest generated Plan) when it is a
 * different, not-yet-engaged program; otherwise the next published catalog
 * program the user hasn't bought or started, same type first. null when
 * nothing qualifies (the client then hides the card's View Program button).
 */
export async function getNextProgramRecommendation(
  userId: string,
  current: { id: string; type: string },
): Promise<NextProgramRecommendation | null> {
  const [purchases, sessions, plan] = await Promise.all([
    prisma.programPurchase.findMany({ where: { userId }, select: { programId: true } }),
    prisma.workoutSession.findMany({ where: { userId }, select: { workout: { select: { programId: true } } } }),
    prisma.plan.findFirst({
      where: { userId, status: "generated", programId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { programId: true },
    }),
  ]);
  const engaged = new Set<string>([current.id]);
  for (const p of purchases as Array<{ programId: string }>) engaged.add(p.programId);
  for (const s of sessions as Array<{ workout: { programId: string } }>) engaged.add(s.workout.programId);

  const select = { id: true, name: true, durationWeeks: true, type: true } as const;
  if (plan?.programId && !engaged.has(plan.programId)) {
    const planned = await prisma.program.findFirst({
      where: { id: plan.programId, status: "published", ownerUserId: null },
      select,
    });
    if (planned) return { id: planned.id, name: planned.name, durationWeeks: planned.durationWeeks, source: "plan" };
  }

  // Catalog fallback: same type first, then the lowest level that is not
  // easier than the program just finished (a natural progression), newest first.
  const rank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
  const levelOf = (ws: Array<{ intensity: keyof typeof rank }>) => ws.reduce((top, w) => Math.max(top, rank[w.intensity]), 0);
  const currentWorkouts = (await prisma.workout.findMany({ where: { programId: current.id }, select: { intensity: true } })) as Array<{ intensity: keyof typeof rank }>;
  const currentLevel = levelOf(currentWorkouts);
  const candidates = (await prisma.program.findMany({
    where: { status: "published", ownerUserId: null, id: { notIn: Array.from(engaged) } },
    orderBy: { createdAt: "desc" },
    select: { ...select, workouts: { select: { intensity: true } } },
  })) as Array<{ id: string; name: string; durationWeeks: number; type: string; workouts: Array<{ intensity: keyof typeof rank }> }>;
  const scored = candidates
    .map((c) => ({ c, level: levelOf(c.workouts) }))
    .sort((x, y) => {
      const typeDiff = Number(y.c.type === current.type) - Number(x.c.type === current.type);
      if (typeDiff !== 0) return typeDiff;
      const xOk = x.level >= currentLevel ? 0 : 1;
      const yOk = y.level >= currentLevel ? 0 : 1;
      if (xOk !== yOk) return xOk - yOk;
      return x.level - y.level;
    });
  const pick = scored[0]?.c;
  return pick ? { id: pick.id, name: pick.name, durationWeeks: pick.durationWeeks, source: "catalog" } : null;
}
