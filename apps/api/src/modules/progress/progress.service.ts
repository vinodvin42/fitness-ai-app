import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { CreateProgressPhotoInput, LogMeasurementInput, SubmitCheckInInput } from "./progress.schema";

/**
 * Progress & Body (docs/mobile/03-screen-inventory.md §F). Phase 2 scope:
 * body measurements (weigh-ins + tape measurements) and Personal Records
 * computed from real training data already logged in Phase 1
 * (ExerciseSetLog) — not a calculated 1RM, just the heaviest set actually
 * logged per exercise, with when it happened. Also (19 Aug 2026)
 * getStreaks — per-category (training/nutrition/hydration) streaks
 * computed from WorkoutSession/MealLog/WaterLog dates, see its own comment
 * below and gap §29 for why "mindfulness" isn't one of the categories. Also
 * (19 Aug 2026) real Progress Photos CRUD — see the ProgressPhoto model's
 * doc comment in schema.prisma and gap §34 for the base64-in-Postgres
 * storage tradeoff. Also (R1 Developer 1 U5, 15 Sep 2026) Check-In — the
 * required "Daily / weekly Check-In" screen, see the CheckIn model's own
 * doc comment in schema.prisma and this file's own Check-In section below
 * for the full design. Not built: Body Composition, AI Insights — see
 * roadmap Phase 2.
 */

export async function logMeasurement(userId: string, input: LogMeasurementInput) {
  const measurement = await prisma.bodyMeasurement.create({ data: { userId, ...input } });

  await recordAudit({
    actorId: userId,
    action: "body_measurement.logged",
    entityType: "BodyMeasurement",
    entityId: measurement.id,
    metadata: { fields: Object.keys(input) },
  });

  return measurement;
}

export function listMeasurements(userId: string) {
  return prisma.bodyMeasurement.findMany({
    where: { userId },
    orderBy: { loggedAt: "desc" },
  });
}

/**
 * Heaviest logged set per exercise, across every completed or in-progress
 * session — a simple, honest "personal record" from data the user actually
 * produced, rather than an estimated 1RM formula. Exported (not just used
 * by getProgressOverview below) because Timeline (docs/mobile/03-screen-
 * inventory.md §G, apps/api/src/modules/timeline/timeline.service.ts)
 * reuses this exact computation for its "PR" event type, so Progress
 * Overview and Timeline never disagree about what counts as a PR.
 */
export async function getPersonalRecords(userId: string) {
  const setLogs = await prisma.exerciseSetLog.findMany({
    where: { session: { userId }, weightKg: { not: null } },
    include: { exercise: true },
    orderBy: { loggedAt: "asc" },
  });

  const bestByExercise = new Map<
    string,
    { exerciseId: string; exerciseName: string; bestWeightKg: number; reps: number; achievedAt: Date }
  >();

  for (const log of setLogs) {
    if (log.weightKg == null) continue;
    const current = bestByExercise.get(log.exerciseId);
    if (!current || log.weightKg > current.bestWeightKg) {
      bestByExercise.set(log.exerciseId, {
        exerciseId: log.exerciseId,
        exerciseName: log.exercise.name,
        bestWeightKg: log.weightKg,
        reps: log.reps,
        achievedAt: log.loggedAt,
      });
    }
  }

  return Array.from(bestByExercise.values()).sort((a, b) => b.bestWeightKg - a.bestWeightKg);
}

// ---- Streak Tracker --------------------------------------------------
// docs/mobile/03-screen-inventory.md §F: per-habit-category streaks
// (training/nutrition/hydration — NOT mindfulness, see gap §29), computed
// from real dates already logged in WorkoutSession/MealLog/WaterLog. Same
// "computed, not stored" precedent as getPersonalRecords above — no new
// StreakRecord table, even though docs/mobile/05-data-model.md sketched
// one, since deriving from real logs is more honest than a second source
// of truth that could drift from it.

function toDateKey(d: Date): string {
  // UTC day boundary — same convention as nutrition.service.ts's
  // startOfToday(), so "today" means the same thing across both modules.
  return d.toISOString().slice(0, 10);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function computeStreak(dateKeys: Set<string>): { current: number; longest: number } {
  if (dateKeys.size === 0) {
    return { current: 0, longest: 0 };
  }

  // Longest streak: walk the sorted unique day-keys and count the longest
  // run of calendar-consecutive days.
  const sorted = Array.from(dateKeys).sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const curr = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    const diffDays = Math.round((curr - prev) / ONE_DAY_MS);
    run = diffDays === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // Current streak: walk backward from today, falling back to yesterday if
  // today has no activity logged yet (the day isn't over, so a streak that
  // was alive through yesterday shouldn't read as broken at midnight).
  let cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  if (!dateKeys.has(toDateKey(cursor))) {
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
  }
  let current = 0;
  while (dateKeys.has(toDateKey(cursor))) {
    current += 1;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
  }

  return { current, longest };
}

export async function getStreaks(userId: string) {
  const [sessions, mealLogs, waterLogs] = await Promise.all([
    prisma.workoutSession.findMany({ where: { userId }, select: { startedAt: true } }),
    prisma.mealLog.findMany({ where: { userId }, select: { loggedAt: true } }),
    prisma.waterLog.findMany({ where: { userId }, select: { loggedAt: true } }),
  ]);

  // Explicit param + return types below, and an explicit Set<string>
  // generic — same Prisma-stub sandbox workaround as getProgressOverview's
  // weightHistory mapping (see its own comment / this module's README
  // note); without the explicit `: string` return type here, the stub's
  // untyped findMany() result infers as Set<unknown>, not Set<string>.
  const trainingDates = new Set<string>(sessions.map((s: { startedAt: Date }): string => toDateKey(s.startedAt)));
  const nutritionDates = new Set<string>(mealLogs.map((m: { loggedAt: Date }): string => toDateKey(m.loggedAt)));
  const hydrationDates = new Set<string>(waterLogs.map((w: { loggedAt: Date }): string => toDateKey(w.loggedAt)));

  const training = computeStreak(trainingDates);
  const nutrition = computeStreak(nutritionDates);
  const hydration = computeStreak(hydrationDates);
  const overall = computeStreak(new Set([...trainingDates, ...nutritionDates, ...hydrationDates]));

  return {
    categories: [
      {
        category: "training" as const,
        currentStreak: training.current,
        longestStreak: training.longest,
        activeDates: Array.from(trainingDates),
      },
      {
        category: "nutrition" as const,
        currentStreak: nutrition.current,
        longestStreak: nutrition.longest,
        activeDates: Array.from(nutritionDates),
      },
      {
        category: "hydration" as const,
        currentStreak: hydration.current,
        longestStreak: hydration.longest,
        activeDates: Array.from(hydrationDates),
      },
    ],
    overall: { currentStreak: overall.current, longestStreak: overall.longest },
  };
}

export async function getProgressOverview(userId: string) {
  const [recentMeasurements, personalRecords] = await Promise.all([
    prisma.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { loggedAt: "desc" },
      take: 10,
    }),
    getPersonalRecords(userId),
  ]);

  return {
    latestMeasurement: recentMeasurements[0] ?? null,
    // oldest-first, so a client can plot it left-to-right as a trend.
    // NOTE: callback params are explicitly typed rather than inferred —
    // apps/api's stub @prisma/client (see README's "Note on this scaffold")
    // types findMany()'s result as `any` until `prisma generate` runs, which
    // would otherwise make these implicit-any under this project's strict
    // tsconfig. A real generated client infers this correctly on its own.
    weightHistory: recentMeasurements
      .filter((m: { weightKg: number | null }) => m.weightKg != null)
      .map((m: { weightKg: number | null; loggedAt: Date }) => ({ weightKg: m.weightKg as number, loggedAt: m.loggedAt }))
      .reverse(),
    personalRecords,
  };
}

// ---- Progress Photos ---------------------------------------------------
// docs/mobile/03-screen-inventory.md §F — real photo storage (base64 data
// URI directly in Postgres, see the ProgressPhoto model's own doc comment
// in schema.prisma and gap §34), a genuinely deletable "asset" like a
// Reminder rather than immutable history like a WorkoutSession, so this
// gets the same getOwned-then-delete pattern reminders.service.ts already
// established (404, not 403, on someone else's photo ID — don't reveal
// whose it is).

async function getOwnedProgressPhoto(photoId: string, userId: string) {
  const photo = await prisma.progressPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.userId !== userId) {
    throw new ApiHttpError(404, "progress_photo_not_found", "Progress photo not found");
  }
  return photo;
}

export function listProgressPhotos(userId: string) {
  return prisma.progressPhoto.findMany({
    where: { userId },
    orderBy: { takenAt: "desc" },
  });
}

export async function createProgressPhoto(userId: string, input: CreateProgressPhotoInput) {
  const photo = await prisma.progressPhoto.create({ data: { userId, ...input } });

  await recordAudit({
    actorId: userId,
    action: "progress_photo.created",
    entityType: "ProgressPhoto",
    entityId: photo.id,
    // Deliberately no image bytes in the audit metadata — this is a
    // write-once, permanent log (see auditLog.ts), and a body photo is
    // sensitive enough that it shouldn't be duplicated into a second,
    // undeleteable place just because an entry happened to be logged.
    metadata: { hasNote: input.note != null },
  });

  return photo;
}

export async function deleteProgressPhoto(userId: string, photoId: string) {
  await getOwnedProgressPhoto(photoId, userId);

  await prisma.progressPhoto.delete({ where: { id: photoId } });

  await recordAudit({
    actorId: userId,
    action: "progress_photo.deleted",
    entityType: "ProgressPhoto",
    entityId: photoId,
    metadata: {},
  });
}

// ---- Check-In (R1 Developer 1 U5, 15 Sep 2026) --------------------------
// See the CheckIn model's own doc comment in schema.prisma for the full
// design — a required "Daily / weekly Check-In" screen (work package §4)
// with zero prior backing, scoped as a real, self-contained, honestly-
// persisted signal (energy/soreness/adherence, 1-5 each, plus an optional
// note), deliberately NOT wired into plans.service.ts's Recommendation
// prompt or a fabricated "context confidence" score — see this pass's own
// gap-doc entry for the full reasoning.

function isoWeekKey(d: Date): string {
  // Real ISO 8601 week numbering (Monday-start weeks, the year of a week
  // is whichever year its Thursday falls in) — not a "days since epoch /
  // 7" approximation, which would drift at year boundaries. UTC
  // throughout, same boundary convention toDateKey() above already uses.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this ISO week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const weekNum = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * ONE_DAY_MS));
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}

function currentPeriodKey(period: "daily" | "weekly"): string {
  return period === "daily" ? toDateKey(new Date()) : isoWeekKey(new Date());
}

/**
 * Submits a Check-In for the real current period (today, or this ISO
 * week) — at most one per user per period, ever, per the CheckIn model's
 * `@@unique([userId, period, periodKey])`. The actual "claim once" gate is
 * that DB constraint, not a pre-insert `findFirst` the API layer could
 * race on: two concurrent submits for the same period both attempt a real
 * `create`, and Postgres itself guarantees only one can succeed — the
 * loser's `create` throws a unique-constraint violation (Prisma error
 * P2002), caught below and turned into an honest 409. This is the same
 * "the DB is the real gate, not an in-process snapshot" discipline
 * nutrition.service.ts's confirmFoodEstimate() and payments.service.ts's
 * activatePayment() already established for their own concurrent-write
 * races — just expressed as a unique-constrained `create` instead of a
 * conditional `updateMany`, since there's no pre-existing row here to
 * conditionally update.
 */
export async function submitCheckIn(userId: string, input: SubmitCheckInInput) {
  const periodKey = currentPeriodKey(input.period);

  let checkIn;
  try {
    checkIn = await prisma.checkIn.create({
      data: {
        userId,
        period: input.period,
        periodKey,
        energy: input.energy,
        soreness: input.soreness,
        adherence: input.adherence,
        note: input.note ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiHttpError(
        409,
        "check_in_already_submitted",
        input.period === "daily"
          ? "You've already checked in for today"
          : "You've already checked in for this week",
      );
    }
    throw err;
  }

  await recordAudit({
    actorId: userId,
    action: "check_in.submitted",
    entityType: "CheckIn",
    entityId: checkIn.id,
    metadata: { period: input.period, periodKey, hasNote: input.note != null },
  });

  return checkIn;
}

/**
 * Whether the user has already checked in for the real current daily and
 * weekly period — read plainly off real rows, never inferred or defaulted
 * to "not started" vs. some fabricated in-between state (BR-AI-011,
 * "uncertainty is visible and valid" — this app's honest reading of that
 * for a Check-In is simply never claiming a submission exists when it
 * doesn't).
 */
export async function getCheckInStatus(userId: string) {
  const dailyKey = currentPeriodKey("daily");
  const weeklyKey = currentPeriodKey("weekly");

  const [daily, weekly] = await Promise.all([
    prisma.checkIn.findUnique({ where: { userId_period_periodKey: { userId, period: "daily", periodKey: dailyKey } } }),
    prisma.checkIn.findUnique({ where: { userId_period_periodKey: { userId, period: "weekly", periodKey: weeklyKey } } }),
  ]);

  return {
    daily: { submitted: daily !== null, checkIn: daily },
    weekly: { submitted: weekly !== null, checkIn: weekly },
  };
}

/** Recent Check-Ins, newest first — backs the small history strip on the Check-In screen. Real, unfiltered history, same "no computed trend beyond what's actually there" discipline as getStreaks/getProgressOverview above. */
export function listCheckIns(userId: string) {
  return prisma.checkIn.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}
