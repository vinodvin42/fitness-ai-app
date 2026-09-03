import { prisma } from "../../db/prisma";
import { GetUserAnalyticsQuery } from "./adminAnalytics.schema";

/**
 * Module 09 — Analytics, 09.01 User Analytics only
 * (docs/admin/03-screen-inventory.md §09.01), added 25 Aug 2026 — the
 * first admin screen over cross-user growth/engagement/revenue data
 * that isn't the fixed-window Executive Dashboard (`adminDashboard.
 * service.ts`, still 30 days / 6 months, not admin-adjustable). Picked
 * this cycle because it's the one remaining console gap that needs NO
 * new Prisma entity at all — every number here is a real aggregate over
 * `User`/`Payment`/`Referral`/`WorkoutSession`/`MealLog`/`WaterLog`,
 * tables that already exist and are already being written to. At the time
 * this was written, everything else left in the console (04.03,
 * 05.04/05.05, 06.01/06.04/06.05, 07.01/07.02/07.04, 08.02–08.04, 12.02,
 * 12.04–12.08) needed either a brand-new entity or a product decision —
 * 04.03 and 05.05 have since shipped (both turned out to be resolvable,
 * not genuinely blocked — see adminRelationships.service.ts and
 * adminPrograms.service.ts) — see this project's own status review (25
 * Aug 2026) for the full accounting as of this module's own build.
 *
 * **Why only 09.01, and only part of its own 7-tab spec:**
 * The Figma's 09.01 is itself a hub with 7 tabs (User Analytics, Training,
 * Nutrition, Recovery, AI, Business, Geographic) plus a "compare" toggle —
 * effectively folding pieces of 09.02–09.06 in as tabs. Real data exists
 * for 4 of those 7:
 * - **User Analytics** (built, see below) — growth, activity, revenue,
 *   referrals, all real.
 * - **Training** (built, lighter) — real `WorkoutSession`/`ExerciseSetLog`
 *   aggregates for the same date range.
 * - **Nutrition** (built, lighter) — real `MealLog`/`WaterLog` aggregates.
 * - **Recovery, AI, Business, Geographic** — genuinely NOT buildable, not
 *   just deferred: Recovery needs the Bluetooth/HealthKit integration
 *   this build has never had a mock data source for (same gap as mobile's
 *   §E); AI needs a shipped AI feature to report usage on, and Phase 2's
 *   AI Coach was never built; Business needs a take-rate/commission model
 *   (`CoachSettlement`, unmodeled — same gap as Commerce's 06.01
 *   waterfall); Geographic needs a `User.country`/region field that
 *   doesn't exist anywhere in this schema (flagged repeatedly since
 *   Module 02's own Directory filter). `notAvailable` names all four.
 * - **26 Aug 2026: the AI tab and the "compare" toggle are real now
 *   too.** `AiCoachMessage` (added the same day as the original version
 *   of this file, 25 Aug 2026's AI Coach chat build — this comment was
 *   written before that connection was made) is a real, already-written-
 *   to table: the AI tab reports total messages, distinct users who used
 *   AI Coach, and a messages-per-day series for the selected range — the
 *   same "aggregate over an existing table" pattern every other real tab
 *   here uses. The compare toggle doesn't build the Figma's fuller side-
 *   by-side view (still a meaningfully bigger feature) but now surfaces
 *   something real instead of nothing: each KPI's raw previous-period
 *   value (`previousValue`), already computed to feed `trend()` below
 *   but never returned until now — the frontend's toggle reveals it next
 *   to the existing trend badge.
 * - **Recovery and Business tabs remain genuinely NOT buildable**:
 *   Recovery needs the Bluetooth/HealthKit integration this build has
 *   never had a mock data source for (same gap as mobile's §E); Business
 *   needs a take-rate/commission model (`CoachSettlement`, unmodeled —
 *   same gap as Commerce's 06.01 waterfall and Finance's 10.06/10.07).
 *   `notAvailable` names both.
 * - **26 Aug 2026: the Geographic tab is real too** — the region-capture-
 *   method decision this file used to flag as blocking it is resolved:
 *   `User.countryCode` (ISO 3166-1 alpha-2), captured as an explicit
 *   choice on Edit Profile, NOT inferred from `phone` (optional,
 *   unvalidated free text, not collected at signup — see schema.prisma's
 *   own comment on why that path was rejected). This tab is a live
 *   snapshot (country, user count, % of total, all-time revenue),
 *   decoupled from the KPI date filter like retentionCohorts, with a
 *   real, counted "Unknown" bucket for every user who hasn't set it —
 *   see `computeGeographicStats` below. No separate 09.05 route: it
 *   would be an exact duplicate of this tab, so it stays combined, same
 *   "no near-duplicate screens" precedent as Security/Subscription/Coach
 *   Discovery. No map visualization — no mapping library exists in this
 *   build — this is an honest table instead.
 * - **26 Aug 2026: 09.02 Engagement and 09.03 Fitness & Nutrition are
 *   now real, separate screens** (`getEngagementAnalytics`/
 *   `getFitnessNutritionAnalytics` below) — this comment used to call
 *   them out of scope as "near-duplicate" of 09.01's tabs; revisited the
 *   same way 10.08 Taxes was reclassified during the Finance pass, once
 *   each was actually scoped out. 09.02 is a genuine conversion
 *   **funnel** (signup → onboarding → first workout → 7-day retention)
 *   plus a weekly retention curve — a different grain and a different
 *   question ("do new users convert and stick") than 09.01's monthly
 *   cohort table ("do existing cohorts keep training"). 09.03 is a
 *   genuine **drill-down** (top exercises, per-program completion rates,
 *   top-logged meals) below 09.01's Training/Nutrition tabs' plain
 *   totals — neither new screen re-computes a number 09.01 already
 *   shows.
 * - **09.04 Business Analytics is still NOT built as its own screen** —
 *   needs the same missing take-rate/commission entity 09.01's Business
 *   tab is blocked on; nothing about 09.02/09.03/09.06 shipping changes
 *   that (Business is a genuinely separate gap from Unit Economics —
 *   commission structure vs. acquisition cost, not the same blocker
 *   counted twice).
 *   **09.05 Geographic Analytics is real now but deliberately combined
 *   into 09.01's tab rather than a separate route** — see the "26 Aug
 *   2026" Geographic entry above for why.
 * - **27 Aug 2026: 09.06 Unit Economics / Cohorts is real too, as its own
 *   screen** (`getUnitEconomics` below) — re-investigating
 *   `reports/build-plan.html`'s own "needs your decision" framing found
 *   the acquisition-cost data it said was missing had already shipped
 *   the day before, as Finance's `Expense.category: "marketing"` (10.03).
 *   See that function's own comment for the full real-vs-not breakdown.
 *
 * **The Retention Cohort table** is the one genuinely new visualization
 * in this build (nothing before this computed retention). It's
 * DELIBERATELY decoupled from the `startDate`/`endDate` KPI filter — a
 * cohort table needs its own natural month-over-month axis to mean
 * anything, so it always shows the last 6 calendar months' signup
 * cohorts × months-since-signup (0–3), independent of whatever range an
 * admin has the KPI row scoped to. "Retained" = the cohort user had ≥1
 * `WorkoutSession` in that relative month — the same activity signal
 * `adminDashboard.service.ts`'s `activeUsers30d` already uses (generalized
 * here to workouts specifically, since a cohort table needs one
 * consistent signal, not an OR across three different log types). A
 * future month that hasn't happened yet renders as `null` (too early to
 * know), not `0` (which would misrepresent it as "nobody returned").
 *
 * Deliberately does NOT import `User`/`Payment`/`Referral`/etc. as Prisma
 * model types — same reasoning as every other admin service file this
 * build (the un-generated `@prisma/client` stub has no real model
 * exports).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MONTHS = 6;
const RETENTION_OFFSETS = [0, 1, 2, 3];

function resolvePeriod(query: GetUserAnalyticsQuery) {
  const now = new Date();
  const end = query.endDate ? new Date(query.endDate) : now;
  const start = query.startDate ? new Date(query.startDate) : new Date(end.getTime() - 30 * DAY_MS);
  const periodMs = Math.max(end.getTime() - start.getTime(), DAY_MS);
  const prevEnd = start;
  const prevStart = new Date(start.getTime() - periodMs);
  return { start, end, prevStart, prevEnd };
}

/** current vs. previous — null when the previous period had nothing to compare against (can't express "% change from zero" honestly). */
function trend(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function countActiveUsers(gte: Date, lte: Date): Promise<number> {
  return prisma.user.count({
    where: {
      OR: [
        { workoutSessions: { some: { startedAt: { gte, lte } } } },
        { mealLogs: { some: { loggedAt: { gte, lte } } } },
        { bodyMeasurements: { some: { loggedAt: { gte, lte } } } },
      ],
    },
  });
}

async function sumRevenueCents(gte: Date, lte: Date): Promise<number> {
  const agg = await prisma.payment.aggregate({ where: { status: "paid", createdAt: { gte, lte } }, _sum: { amountCents: true } });
  return (agg._sum.amountCents as number | null) ?? 0;
}

/** Buckets a set of {createdAt} rows into one count per calendar day across [start, end], filling zero for days with no rows — an honest complete series, not just the days that happened to have data. */
function bucketByDay(rows: Array<{ createdAt: Date }>, start: Date, end: Date): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days: Array<{ date: string; count: number }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function bucketRevenueByDay(rows: Array<{ createdAt: Date; amountCents: number }>, start: Date, end: Date): Array<{ date: string; amountCents: number }> {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    sums.set(key, (sums.get(key) ?? 0) + row.amountCents);
  }
  const days: Array<{ date: string; amountCents: number }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: key, amountCents: sums.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

async function computeRetentionCohorts(now: Date) {
  const cohortMonths: { label: string; start: Date; end: Date }[] = [];
  for (let i = RETENTION_MONTHS - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    cohortMonths.push({ label: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), start, end });
  }

  return Promise.all(
    cohortMonths.map(async ({ label, start, end }, monthIndex) => {
      const cohortUsers = (await prisma.user.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { id: true },
      })) as Array<{ id: string }>;
      const cohortSize = cohortUsers.length;
      const cohortIds = cohortUsers.map((u) => u.id);

      const retention = await Promise.all(
        RETENTION_OFFSETS.map(async (offset) => {
          // Offset months that haven't happened yet for this cohort (or
          // land beyond "now") aren't knowable — render null, not 0.
          const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
          if (offset > monthsElapsed || cohortSize === 0) return { offset, retainedPct: null as number | null };

          const offsetStart = new Date(start.getFullYear(), start.getMonth() + offset, 1);
          const offsetEnd = new Date(start.getFullYear(), start.getMonth() + offset + 1, 1);
          const retainedRows = (await prisma.workoutSession.findMany({
            where: { userId: { in: cohortIds }, startedAt: { gte: offsetStart, lt: offsetEnd } },
            distinct: ["userId"],
            select: { userId: true },
          })) as Array<{ userId: string }>;
          return { offset, retainedPct: Math.round((retainedRows.length / cohortSize) * 1000) / 10 };
        }),
      );

      return { cohort: label, cohortSize, monthIndex, retention };
    }),
  );
}

async function computeTrainingStats(start: Date, end: Date) {
  const completedSessions = (await prisma.workoutSession.findMany({
    where: { status: "completed", startedAt: { gte: start, lte: end } },
    select: { id: true },
  })) as Array<{ id: string }>;
  const totalWorkoutsCompleted = completedSessions.length;

  const totalSetsLogged =
    totalWorkoutsCompleted > 0
      ? await prisma.exerciseSetLog.count({ where: { sessionId: { in: completedSessions.map((s) => s.id) } } })
      : 0;

  return {
    totalWorkoutsCompleted,
    totalSetsLogged,
    avgSetsPerSession: totalWorkoutsCompleted > 0 ? Math.round((totalSetsLogged / totalWorkoutsCompleted) * 10) / 10 : null,
  };
}

async function computeNutritionStats(start: Date, end: Date, activeUsers: number) {
  const [totalMealsLogged, totalWaterLogs] = await Promise.all([
    prisma.mealLog.count({ where: { loggedAt: { gte: start, lte: end } } }),
    prisma.waterLog.count({ where: { loggedAt: { gte: start, lte: end } } }),
  ]);

  return {
    totalMealsLogged,
    totalWaterLogs,
    avgWaterLogsPerActiveUser: activeUsers > 0 ? Math.round((totalWaterLogs / activeUsers) * 10) / 10 : null,
  };
}

/**
 * AI tab (09.01) and the AI/Recovery card (09.03) — real aggregates over
 * `AiCoachMessage`, added 26 Aug 2026 once its existence was actually
 * noticed (see this file's top comment). `role: "user"` rows are the
 * user's own prompts — that's what "used AI Coach" and "messages sent"
 * should count, not the assistant's replies, which are a 1:1 echo of
 * usage rather than a second, independent usage signal.
 */
async function computeAiStats(start: Date, end: Date) {
  const userTurns = (await prisma.aiCoachMessage.findMany({
    where: { role: "user", createdAt: { gte: start, lte: end } },
    select: { userId: true, createdAt: true },
  })) as Array<{ userId: string; createdAt: Date }>;

  const uniqueUsers = new Set(userTurns.map((m) => m.userId)).size;

  return {
    totalMessages: userTurns.length,
    usersUsingAi: uniqueUsers,
    avgMessagesPerAiUser: uniqueUsers > 0 ? Math.round((userTurns.length / uniqueUsers) * 10) / 10 : null,
    messageSeries: bucketByDay(userTurns, start, end),
  };
}

/**
 * Geographic (09.01 tab, closing the 09.05 "needs a capture-method
 * decision" gap), added 26 Aug 2026 — a live snapshot of the real
 * `User.countryCode` field (see schema.prisma's own comment for why it's
 * captured explicitly on Edit Profile rather than inferred from `phone`).
 * Deliberately decoupled from the KPI date filter, same "own fixed axis"
 * precedent as `computeRetentionCohorts` — a population breakdown isn't a
 * period trend. Revenue is all-time captured `Payment` sum per country,
 * also not date-scoped, for the same reason.
 *
 * `countryCode: null` is a real, counted "Unknown" bucket — every user
 * who signed up before this field existed, or hasn't opened Edit Profile
 * since, is honestly Unknown rather than silently dropped or guessed at.
 * Coverage grows only as real users set it.
 *
 * Deliberately does NOT build the Figma's map visualization — no
 * mapping/GeoJSON library exists anywhere in this build. This table
 * (country, user count, % of total, revenue) is a smaller, honest
 * substitute, same "compare toggle" precedent of shipping something real
 * instead of the full spec'd view. Also deliberately NOT a separate 09.05
 * route: the content would be an exact duplicate of this tab, and this
 * build already has a "combine near-duplicate screens" precedent
 * (Security, Subscription, Coach Discovery) it's following here instead
 * of adding nav clutter for identical data.
 */
async function computeGeographicStats() {
  const [userRows, paidPayments] = await Promise.all([
    // 31 Aug 2026 (first real Prisma client generation): orderBy is required
    // by groupBy's typing when an aggregate (_count) is present, and the old
    // `as Promise<Array<...>>` result cast broke overload inference — the
    // inferred return is already exactly this shape, so the cast is dropped.
    prisma.user.groupBy({ by: ["countryCode"], _count: { _all: true }, orderBy: { countryCode: "asc" } }),
    prisma.payment.findMany({
      where: { status: "paid" },
      select: { amountCents: true, user: { select: { countryCode: true } } },
    }) as Promise<Array<{ amountCents: number; user: { countryCode: string | null } }>>,
  ]);

  const revenueByCountry = new Map<string, number>();
  for (const p of paidPayments) {
    const key = p.user.countryCode ?? "__unknown__";
    revenueByCountry.set(key, (revenueByCountry.get(key) ?? 0) + p.amountCents);
  }

  const totalUsers = userRows.reduce((sum, r) => sum + r._count._all, 0);

  const breakdown = userRows
    .map((r) => ({
      countryCode: r.countryCode,
      userCount: r._count._all,
      userPct: totalUsers > 0 ? Math.round((r._count._all / totalUsers) * 1000) / 10 : 0,
      revenueCents: revenueByCountry.get(r.countryCode ?? "__unknown__") ?? 0,
    }))
    .sort((a, b) => b.userCount - a.userCount);

  return { totalUsers, breakdown };
}

export async function getUserAnalytics(query: GetUserAnalyticsQuery) {
  const { start, end, prevStart, prevEnd } = resolvePeriod(query);
  const now = new Date();

  const [
    newUsers,
    prevNewUsers,
    activeUsers,
    prevActiveUsers,
    revenueCents,
    prevRevenueCents,
    referralSignups,
    prevReferralSignups,
    signupRows,
    paymentRows,
    retentionCohorts,
    trainingStats,
    nutritionStats,
    aiStats,
    geographic,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.user.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
    countActiveUsers(start, end),
    countActiveUsers(prevStart, prevEnd),
    sumRevenueCents(start, end),
    sumRevenueCents(prevStart, prevEnd),
    prisma.referral.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.referral.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
    prisma.user.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true } }),
    prisma.payment.findMany({ where: { status: "paid", createdAt: { gte: start, lte: end } }, select: { createdAt: true, amountCents: true } }),
    computeRetentionCohorts(now),
    computeTrainingStats(start, end),
    countActiveUsers(start, end).then((active) => computeNutritionStats(start, end, active)),
    computeAiStats(start, end),
    computeGeographicStats(),
  ]);

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    kpis: {
      newUsers: { value: newUsers, previousValue: prevNewUsers, trendPct: trend(newUsers, prevNewUsers) },
      activeUsers: { value: activeUsers, previousValue: prevActiveUsers, trendPct: trend(activeUsers, prevActiveUsers) },
      revenueCents: { value: revenueCents, previousValue: prevRevenueCents, trendPct: trend(revenueCents, prevRevenueCents) },
      referralSignups: { value: referralSignups, previousValue: prevReferralSignups, trendPct: trend(referralSignups, prevReferralSignups) },
    },
    signupSeries: bucketByDay(signupRows as Array<{ createdAt: Date }>, start, end),
    revenueSeries: bucketRevenueByDay(paymentRows as Array<{ createdAt: Date; amountCents: number }>, start, end),
    retentionCohorts,
    trainingStats,
    nutritionStats,
    aiStats,
    geographic,
    // Recovery/Business tabs — see this file's top comment for why each
    // still has no real backing data. AI, the compare toggle, and
    // Geographic are no longer in this list — see 26 Aug 2026 above.
    notAvailable: ["recoveryAnalytics", "businessAnalytics"],
  };
}

// ---- 09.02 Engagement --------------------------------------------------
// Added 26 Aug 2026 — see this file's top comment for why this is a
// genuinely distinct screen from 09.01, not a near-duplicate. "Signed up"
// uses the same `startDate`/`endDate` range as 09.01's KPI row; the
// weekly retention curve below is deliberately decoupled from it, same
// "cohort tables need their own fixed axis" precedent as 09.01's monthly
// one.

const WEEKLY_RETENTION_WEEKS = 6;
const WEEK_MS = 7 * DAY_MS;

async function computeFunnel(start: Date, end: Date) {
  const signedUpUsers = (await prisma.user.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { id: true, createdAt: true },
  })) as Array<{ id: string; createdAt: Date }>;
  const signedUpIds = signedUpUsers.map((u) => u.id);
  const signedUp = signedUpIds.length;

  if (signedUp === 0) {
    return { signedUp: 0, completedOnboarding: 0, loggedFirstWorkout: 0, retainedWeek1: 0 };
  }

  const [onboardedRows, workoutUserRows] = await Promise.all([
    prisma.onboardingProfile.findMany({
      where: { userId: { in: signedUpIds }, completedAt: { not: null } },
      select: { userId: true },
    }) as Promise<Array<{ userId: string }>>,
    prisma.workoutSession.findMany({
      where: { userId: { in: signedUpIds } },
      distinct: ["userId"],
      select: { userId: true },
    }) as Promise<Array<{ userId: string }>>,
  ]);
  const completedOnboarding = onboardedRows.length;
  const loggedFirstWorkout = workoutUserRows.length;

  // Retained week 1 — had ≥1 WorkoutSession within 7 days of THEIR OWN
  // signup (not a fixed calendar week), same "relative to signup" framing
  // as the monthly retention cohorts, just at week grain.
  const createdAtById = new Map(signedUpUsers.map((u) => [u.id, u.createdAt]));
  const workoutRowsInWindow = (await prisma.workoutSession.findMany({
    where: { userId: { in: signedUpIds } },
    select: { userId: true, startedAt: true },
  })) as Array<{ userId: string; startedAt: Date }>;
  const retainedIds = new Set<string>();
  for (const row of workoutRowsInWindow) {
    const signupAt = createdAtById.get(row.userId);
    if (!signupAt) continue;
    if (row.startedAt.getTime() - signupAt.getTime() <= WEEK_MS && row.startedAt.getTime() >= signupAt.getTime()) {
      retainedIds.add(row.userId);
    }
  }

  return { signedUp, completedOnboarding, loggedFirstWorkout, retainedWeek1: retainedIds.size };
}

/** Weekly signup cohorts × weeks-since-signup (0..WEEKLY_RETENTION_WEEKS-1), same null-for-not-yet-knowable rule as the monthly table. */
async function computeWeeklyRetention(now: Date) {
  const weeks: { label: string; start: Date; end: Date }[] = [];
  for (let i = WEEKLY_RETENTION_WEEKS - 1; i >= 0; i -= 1) {
    const end = new Date(now.getTime() - i * WEEK_MS);
    const start = new Date(end.getTime() - WEEK_MS);
    weeks.push({ label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, start, end });
  }

  return Promise.all(
    weeks.map(async ({ label, start, end }, weekIndex) => {
      const cohortUsers = (await prisma.user.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { id: true },
      })) as Array<{ id: string }>;
      const cohortSize = cohortUsers.length;
      const cohortIds = cohortUsers.map((u) => u.id);

      const retention = await Promise.all(
        [0, 1, 2, 3].map(async (offset) => {
          const weeksElapsed = Math.floor((now.getTime() - start.getTime()) / WEEK_MS);
          if (offset > weeksElapsed || cohortSize === 0) return { offset, retainedPct: null as number | null };
          const offsetStart = new Date(start.getTime() + offset * WEEK_MS);
          const offsetEnd = new Date(start.getTime() + (offset + 1) * WEEK_MS);
          const retainedRows = (await prisma.workoutSession.findMany({
            where: { userId: { in: cohortIds }, startedAt: { gte: offsetStart, lt: offsetEnd } },
            distinct: ["userId"],
            select: { userId: true },
          })) as Array<{ userId: string }>;
          return { offset, retainedPct: Math.round((retainedRows.length / cohortSize) * 1000) / 10 };
        }),
      );

      return { cohort: label, cohortSize, weekIndex, retention };
    }),
  );
}

/**
 * Per-day breakdown backing the funnel — how many of each day's signups
 * reached each later stage, so the funnel's totals aren't just one
 * opaque number. Small date ranges only (this loops one query set per
 * day) — the frontend's default 30-day range keeps this reasonable, same
 * bound implicitly relied on by `bucketByDay` elsewhere in this file.
 */
async function computeFunnelByDay(start: Date, end: Date) {
  const days = bucketByDay([], start, end).map((d) => d.date);
  return Promise.all(
    days.map(async (dateKey) => {
      const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
      const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
      const f = await computeFunnel(dayStart, dayEnd);
      return { date: dateKey, ...f };
    }),
  );
}

export async function getEngagementAnalytics(query: GetUserAnalyticsQuery) {
  const { start, end } = resolvePeriod(query);
  const now = new Date();

  const [funnel, weeklyRetention, byDay] = await Promise.all([
    computeFunnel(start, end),
    computeWeeklyRetention(now),
    // Capped to ranges of 31 days or fewer — beyond that, the per-day
    // table would be both slow (N sequential funnel queries) and too
    // dense to read; the funnel/weeklyRetention numbers above still
    // cover the full range regardless.
    end.getTime() - start.getTime() <= 31 * DAY_MS ? computeFunnelByDay(start, end) : Promise.resolve(null),
  ]);

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    funnel,
    weeklyRetention,
    byDay,
    notAvailable: byDay === null ? ["funnelByDay"] : [],
  };
}

// ---- 09.03 Fitness & Nutrition -----------------------------------------
// Added 26 Aug 2026 — see this file's top comment. Deliberately reuses
// computeTrainingStats/computeNutritionStats/computeAiStats above rather
// than recomputing the same totals a second way.

async function computeTopExercises(start: Date, end: Date, limit = 8) {
  const setLogs = (await prisma.exerciseSetLog.findMany({
    where: { loggedAt: { gte: start, lte: end } },
    select: { exerciseId: true },
  })) as Array<{ exerciseId: string }>;
  if (setLogs.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of setLogs) counts.set(row.exerciseId, (counts.get(row.exerciseId) ?? 0) + 1);
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

  const exercises = (await prisma.exercise.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, name: true, muscleGroup: true },
  })) as Array<{ id: string; name: string; muscleGroup: string }>;
  const byId = new Map(exercises.map((e) => [e.id, e]));

  return topIds.map(([id, setsLogged]) => ({
    exerciseId: id,
    name: byId.get(id)?.name ?? "Unknown exercise",
    muscleGroup: byId.get(id)?.muscleGroup ?? "—",
    setsLogged,
  }));
}

/** Avg % of a program's workouts a purchaser has completed at least once, averaged across every purchaser — real "program progress", not a fabricated single number. Only programs with ≥1 purchase are returned. */
async function computeProgramProgress(limit = 8) {
  const programs = (await prisma.program.findMany({
    where: { purchases: { some: {} } },
    select: { id: true, name: true, workouts: { select: { id: true } }, purchases: { select: { userId: true } } },
    take: limit,
    orderBy: { purchases: { _count: "desc" } },
  })) as Array<{ id: string; name: string; workouts: Array<{ id: string }>; purchases: Array<{ userId: string }> }>;

  return Promise.all(
    programs.map(async (program) => {
      const workoutIds = program.workouts.map((w) => w.id);
      const purchaserIds = [...new Set(program.purchases.map((p) => p.userId))];
      if (workoutIds.length === 0 || purchaserIds.length === 0) {
        return { programId: program.id, name: program.name, purchasers: purchaserIds.length, avgCompletionPct: null as number | null };
      }
      const completions = (await prisma.workoutSession.findMany({
        where: { workoutId: { in: workoutIds }, userId: { in: purchaserIds }, status: "completed" },
        distinct: ["userId", "workoutId"],
        select: { userId: true },
      })) as Array<{ userId: string }>;
      const perUserCounts = new Map<string, number>();
      for (const row of completions) perUserCounts.set(row.userId, (perUserCounts.get(row.userId) ?? 0) + 1);
      const pcts = purchaserIds.map((id) => ((perUserCounts.get(id) ?? 0) / workoutIds.length) * 100);
      const avgCompletionPct = Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10;
      return { programId: program.id, name: program.name, purchasers: purchaserIds.length, avgCompletionPct };
    }),
  );
}

async function computeTopMeals(start: Date, end: Date, limit = 8) {
  const meals = (await prisma.mealLog.findMany({
    where: { loggedAt: { gte: start, lte: end } },
    select: { name: true },
  })) as Array<{ name: string }>;
  if (meals.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of meals) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, timesLogged]) => ({ name, timesLogged }));
}

export async function getFitnessNutritionAnalytics(query: GetUserAnalyticsQuery) {
  const { start, end } = resolvePeriod(query);

  const [trainingStats, topExercises, programProgress, nutritionStats, topMeals, aiStats, activeUsers] = await Promise.all([
    computeTrainingStats(start, end),
    computeTopExercises(start, end),
    computeProgramProgress(),
    countActiveUsers(start, end).then((active) => computeNutritionStats(start, end, active)),
    computeTopMeals(start, end),
    computeAiStats(start, end),
    countActiveUsers(start, end),
  ]);

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    training: { stats: trainingStats, topExercises, programProgress },
    nutrition: { stats: nutritionStats, topMeals },
    ai: aiStats,
    activeUsers,
    // Recovery has no backing data anywhere in this build (no wearable
    // integration) — see this file's top comment.
    notAvailable: ["recoveryAnalytics"],
  };
}

// ---- 09.06 Unit Economics / Cohorts -------------------------------------
// Added 27 Aug 2026. reports/build-plan.html's own "needs your decision"
// framing said CAC just needed "an admin-entered monthly spend figure" to
// become real — investigating directly (not trusting that framing at face
// value) found that figure already exists: `Expense` (Finance 10.03,
// shipped 26 Aug 2026) has had a real "marketing" category since day one,
// this analytics module just never read it. No new entity, no new product
// decision needed — the same "the doc's own blocker already shipped
// elsewhere" pattern that unblocked 09.01's Geographic tab a day earlier.
//
// - **Marketing spend / CAC** — period-scoped, the same `incurredAt`-based,
//   status-agnostic sum `adminFinance.service.ts`'s "Expenses MTD" KPI
//   already uses (an incurred cost is real spend even before it's paid
//   out) — not the cash-basis `status: "paid"` filter Finance's Cash
//   Balance uses instead. CAC is `marketingSpendCents / newUsers`, `null`
//   (not a fabricated $0) whenever either side is zero — "no marketing
//   expense logged this period" is a data gap, not free acquisition.
// - **Average LTV** — deliberately NOT period-scoped, same "own fixed
//   axis" reasoning as Geographic's revenue-by-country snapshot: LTV is
//   inherently a lifetime figure. Generalizes `adminUsers.service.ts`'s
//   existing per-user `lifetimeValue.totalSpentCents` to a platform-wide
//   average (all-time paid revenue ÷ user count) instead of inventing a
//   second definition of LTV.
// - **LTV:CAC ratio** — all-time avg LTV over the selected period's CAC.
//   Mixing an all-time figure with a period figure is a real
//   simplification (a true cohort-matched ratio would need cohort-level
//   LTV, which the cohort table below provides instead), but it's the
//   same shape most small teams actually track this ratio in practice.
//   Deliberately no "benchmark" comparison (e.g. "3:1 is healthy") — that's
//   industry folklore, not this platform's own data, and dressing up a
//   real number with a fabricated comparison is exactly what this build's
//   discipline elsewhere (Finance's Taxes, Geographic's "Unknown" bucket)
//   has consistently avoided.
// - **Cohort economics table** — reuses `computeRetentionCohorts`'s exact
//   6-calendar-month grouping, but reports each cohort's real avg lifetime
//   revenue and that calendar month's real marketing spend/CAC instead of
//   retention %. This is the one place LTV and CAC are genuinely
//   comparable (both scoped to the same cohort month), and satisfies the
//   Figma's "cohort table" for this screen without duplicating 09.01's
//   retention table.
// - **NOT built** — the Figma's donut split + leaderboard (no
//   acquisition-channel dimension exists anywhere; `Expense.category` is
//   one flat "marketing" bucket, not per-channel spend) and a waterfall
//   chart (no single unambiguous real cost/revenue breakdown exists for
//   one) — `notAvailable` names both. No progress bars anywhere in this
//   build, on any screen — no goal/target concept exists in this schema
//   for any metric to progress toward.

async function sumMarketingSpendCents(gte: Date, lte: Date): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: { category: "marketing", incurredAt: { gte, lte } },
    _sum: { amountCents: true },
  });
  return (agg._sum.amountCents as number | null) ?? 0;
}

/** null (not a fabricated $0) whenever there's nothing real to divide — no spend logged, or no one to have acquired. */
function computeCac(marketingSpendCents: number, newUsers: number): number | null {
  if (marketingSpendCents === 0 || newUsers === 0) return null;
  return Math.round(marketingSpendCents / newUsers);
}

async function computeAverageLtv(): Promise<{ avgLtvCents: number | null; totalUsers: number }> {
  const [totalUsers, revenueAgg] = await Promise.all([
    prisma.user.count(),
    prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amountCents: true } }),
  ]);
  const totalRevenueCents = (revenueAgg._sum.amountCents as number | null) ?? 0;
  return { avgLtvCents: totalUsers > 0 ? Math.round(totalRevenueCents / totalUsers) : null, totalUsers };
}

async function computeCohortEconomics(now: Date) {
  const cohortMonths: { label: string; start: Date; end: Date }[] = [];
  for (let i = RETENTION_MONTHS - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    cohortMonths.push({ label: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), start, end });
  }

  return Promise.all(
    cohortMonths.map(async ({ label, start, end }, monthIndex) => {
      const cohortUsers = (await prisma.user.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { id: true },
      })) as Array<{ id: string }>;
      const cohortSize = cohortUsers.length;
      const cohortIds = cohortUsers.map((u) => u.id);

      const [revenueAgg, marketingSpendCents] = await Promise.all([
        cohortSize > 0
          ? prisma.payment.aggregate({ where: { status: "paid", userId: { in: cohortIds } }, _sum: { amountCents: true } })
          : Promise.resolve({ _sum: { amountCents: 0 as number | null } }),
        sumMarketingSpendCents(start, end),
      ]);
      const cohortRevenueCents = (revenueAgg._sum.amountCents as number | null) ?? 0;

      return {
        cohort: label,
        cohortSize,
        monthIndex,
        avgLtvCents: cohortSize > 0 ? Math.round(cohortRevenueCents / cohortSize) : null,
        marketingSpendCents,
        cacCents: computeCac(marketingSpendCents, cohortSize),
      };
    }),
  );
}

export async function getUnitEconomics(query: GetUserAnalyticsQuery) {
  const { start, end, prevStart, prevEnd } = resolvePeriod(query);
  const now = new Date();

  const [newUsers, prevNewUsers, marketingSpendCents, prevMarketingSpendCents, ltvSnapshot, cohorts] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.user.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
    sumMarketingSpendCents(start, end),
    sumMarketingSpendCents(prevStart, prevEnd),
    computeAverageLtv(),
    computeCohortEconomics(now),
  ]);

  const cacCents = computeCac(marketingSpendCents, newUsers);
  const prevCacCents = computeCac(prevMarketingSpendCents, prevNewUsers);
  const { avgLtvCents, totalUsers } = ltvSnapshot;

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    kpis: {
      newUsers: { value: newUsers, previousValue: prevNewUsers, trendPct: trend(newUsers, prevNewUsers) },
      marketingSpendCents: {
        value: marketingSpendCents,
        previousValue: prevMarketingSpendCents,
        trendPct: trend(marketingSpendCents, prevMarketingSpendCents),
      },
      cacCents: {
        value: cacCents,
        previousValue: prevCacCents,
        trendPct: cacCents !== null && prevCacCents !== null ? trend(cacCents, prevCacCents) : null,
      },
    },
    // Not period-scoped — see this section's own comment above.
    avgLtvCents,
    totalUsers,
    // cacCents > 0, not just !== null — a real CAC that rounds down to $0
    // (tiny spend across many signups) can't express a meaningful ratio
    // any more honestly than a genuinely missing one can.
    ltvToCacRatio: avgLtvCents !== null && cacCents !== null && cacCents > 0 ? Math.round((avgLtvCents / cacCents) * 100) / 100 : null,
    cohorts,
    notAvailable: ["acquisitionChannelSplit", "unitEconomicsWaterfall"],
  };
}

/**
 * 09.04 Business Analytics (docs/admin/03-screen-inventory.md), added 31 Aug
 * 2026 — the sub-module that stayed blocked on a take-rate/commission
 * decision after every other Analytics screen shipped. That decision is now
 * made (configurable per-coach `Professional.commissionPct`, see
 * adminSettlements.service.ts), so the marketplace's real economics are
 * computable for the first time: GMV (delivered booking value), the
 * platform's commission take, coach net earnings, and revenue split by
 * source. "Booking value" is delivered, not collected — coaching bookings
 * don't run through Razorpay yet (coaching.service.ts) — labelled honestly
 * on the screen. The acquisition-channel and LTV-by-channel cuts stay in
 * `notAvailable`: no channel/attribution dimension exists anywhere (same
 * gap 09.06 Unit Economics already flags).
 */
export async function getBusinessAnalytics() {
  const now = new Date();

  const [bookings, subscriptionPayments, programPayments, activeCoaches, settlements] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "confirmed", scheduledAt: { lte: now } },
      select: { priceCents: true, professional: { select: { commissionPct: true } } },
    }),
    prisma.payment.aggregate({
      where: { purpose: "subscription", status: "paid" },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { purpose: "program_purchase", status: "paid" },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.professional.count({ where: { status: "active" } }),
    prisma.coachSettlement.aggregate({ where: { status: "paid" }, _sum: { netCents: true } }),
  ]);

  const bookingRows = bookings as Array<{ priceCents: number; professional: { commissionPct: number } }>;
  let gmvCents = 0;
  let platformCommissionCents = 0;
  for (const b of bookingRows) {
    gmvCents += b.priceCents;
    platformCommissionCents += Math.round((b.priceCents * b.professional.commissionPct) / 100);
  }
  const coachEarningsCents = gmvCents - platformCommissionCents;

  const subscriptionRevenueCents = subscriptionPayments._sum.amountCents ?? 0;
  const programRevenueCents = programPayments._sum.amountCents ?? 0;
  const settlementsPaidCents = (settlements as { _sum: { netCents: number | null } })._sum.netCents ?? 0;

  return {
    marketplace: {
      gmvCents,
      platformCommissionCents,
      coachEarningsCents,
      bookingCount: bookingRows.length,
      activeCoaches,
      avgBookingValueCents: bookingRows.length > 0 ? Math.round(gmvCents / bookingRows.length) : 0,
      takeRatePct: gmvCents > 0 ? Math.round((platformCommissionCents / gmvCents) * 1000) / 10 : null,
      settlementsPaidCents,
    },
    revenueBySource: [
      { source: "subscriptions", amountCents: subscriptionRevenueCents, count: subscriptionPayments._count },
      { source: "programs", amountCents: programRevenueCents, count: programPayments._count },
      { source: "coaching_gmv", amountCents: gmvCents, count: bookingRows.length },
    ],
    notAvailable: ["acquisitionChannelSplit"],
  };
}
