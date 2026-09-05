import { prisma } from "../../db/prisma";

/**
 * Executive Dashboard (docs/admin/03-screen-inventory.md 01.01), Phase 6
 * first slice, added 20 Aug 2026. Every number below is a real aggregate
 * query against this build's actual data model — nothing here is mocked
 * or hardcoded.
 *
 * **20 Aug 2026 update:** Phase 5 (the coach marketplace) started —
 * `Professional`/`ProfessionalCredential`/`Relationship` are now real
 * (see docs/coach/07-open-questions-gaps.md's "Phase 5 started" entry), so
 * `activeProfessionals`, `pendingProfessionalApplications`,
 * `activeCoachingRelationships`, and `unassignedUsersPool` below are
 * genuine aggregate queries.
 *
 * **25 Aug 2026 update:** the Discovery & Booking product/design conflict
 * (gap §1) was resolved and the `coaching` module shipped — confirming a
 * booking now upserts a real `Relationship` row (see
 * coaching.service.ts's `ensureRelationship`), so `activeCoachingRelationships`
 * and `unassignedUsersPool` are no longer typically-zero placeholders;
 * they move as real bookings come in via apps/user-mobile's Discovery &
 * Booking screens.
 *
 * Still cut, and still explicitly named in `notAvailable` rather than
 * faked: the Figma spec's "pending coaching requests" — a `Booking`
 * entity exists now, but bookings confirm immediately (no
 * approval/pending step, see coaching.service.ts's own doc comment), so
 * there is still no "pending request awaiting review" concept anywhere in
 * this schema for this KPI to count. "Expiring credentials" is also still
 * cut (no expiry-date field exists on `ProfessionalCredential` — the
 * reviewed coach-app screens didn't show one).
 *
 * **6 Sep 2026:** "Open refund requests" is real now, not `notAvailable`
 * — a real `Refund` model has existed since 31 Aug 2026 (`adminRefunds`
 * module), this specific KPI just hadn't been wired up to it until this
 * pass (`requiresAttention.openRefundRequests`, a plain
 * `prisma.refund.count({ where: { status: "pending" } })`).
 *
 * The revenue/conversion-funnel numbers ARE computed from real data
 * (Payment, Subscription). **Update, 6 Sep 2026:** the currency-mismatch
 * caveat that used to sit here (docs/mobile/07-open-questions-gaps.md
 * §38) is resolved — every seeded price is real INR paise now (PAY-02,
 * 5 Sep 2026), so `totalRevenueCents` reads as real INR, not an
 * ambiguous "whatever currency it happened to be recorded in."
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_OF_GROWTH_HISTORY = 6;

export async function getExecutiveDashboardStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    totalUsers,
    newUsersLast30d,
    activeUsers30d,
    activePaidSubscriptions,
    trialingSubscriptions,
    totalPrograms,
    totalProgramPurchases,
    openSupportTickets,
    inProgressSupportTickets,
    failedPayments,
    openRefundRequests,
    revenueAgg,
    recentSignups,
    activeProfessionals,
    pendingProfessionalApplications,
    activeCoachingRelationships,
    usersWithActiveRelationship,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({
      where: {
        OR: [
          { workoutSessions: { some: { startedAt: { gte: thirtyDaysAgo } } } },
          { mealLogs: { some: { loggedAt: { gte: thirtyDaysAgo } } } },
          { bodyMeasurements: { some: { loggedAt: { gte: thirtyDaysAgo } } } },
        ],
      },
    }),
    // distinct userId, not a row count — a user shouldn't have more than
    // one active subscription in practice, but counting distinct users
    // rather than rows is the honest thing to do regardless.
    prisma.subscription
      .findMany({
        where: { status: "active", plan: { priceCents: { gt: 0 } } },
        distinct: ["userId"],
        select: { userId: true },
      })
      .then((rows: unknown[]) => rows.length),
    prisma.subscription
      .findMany({ where: { status: "trialing" }, distinct: ["userId"], select: { userId: true } })
      .then((rows: unknown[]) => rows.length),
    prisma.program.count(),
    prisma.programPurchase.count(),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.supportTicket.count({ where: { status: "in_progress" } }),
    prisma.payment.count({ where: { status: "failed" } }),
    // Added 6 Sep 2026 — see this file's top comment for why this used to
    // be `notAvailable` and no longer is (the `Refund` model has existed
    // since 31 Aug 2026; this KPI just hadn't been wired up to it yet).
    prisma.refund.count({ where: { status: "pending" } }),
    prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amountCents: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, fullName: true, email: true, createdAt: true },
    }),
    prisma.professional.count({ where: { status: "active" } }),
    // "Pending application" = at least one credential submitted and
    // awaiting review (status `pending`) — not `not_verified` (a service
    // selected but never actually submitted yet).
    prisma.professionalCredential
      .findMany({ where: { status: "pending" }, distinct: ["professionalId"], select: { professionalId: true } })
      .then((rows: unknown[]) => rows.length),
    prisma.relationship.count({ where: { status: "active" } }),
    prisma.relationship
      .findMany({ where: { status: "active" }, distinct: ["userId"], select: { userId: true } })
      .then((rows: unknown[]) => rows.length),
  ]);

  // Subscriptions grouped by plan tier (active only) — real counts, no
  // fabricated split.
  const activeSubs = await prisma.subscription.findMany({
    where: { status: "active" },
    include: { plan: { select: { tier: true, name: true, priceCents: true } } },
  });
  const subscriptionsByTier = new Map<string, { tier: string; count: number }>();
  for (const sub of activeSubs as Array<{ plan: { tier: string } }>) {
    const key = sub.plan.tier;
    const existing = subscriptionsByTier.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      subscriptionsByTier.set(key, { tier: key, count: 1 });
    }
  }

  // User growth, last 6 calendar months including the current one —
  // MONTHS_OF_GROWTH_HISTORY separate count queries rather than one
  // full-table scan grouped in JS, so this stays cheap as the user table
  // grows.
  const monthBoundaries: { label: string; start: Date; end: Date }[] = [];
  for (let i = MONTHS_OF_GROWTH_HISTORY - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthBoundaries.push({
      label: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start,
      end,
    });
  }
  const userGrowth = await Promise.all(
    monthBoundaries.map(async ({ label, start, end }) => ({
      month: label,
      count: await prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
    })),
  );

  // Simplified paid-conversion funnel (Figma's "Free Registered -> Trial
  // Users -> Converted Paid", docs/admin/03-screen-inventory.md 01.01).
  // "Free/Registered" here is a derived remainder (everyone not currently
  // trialing or on an active paid plan) rather than its own tracked state
  // — a real accounting for reactivation/downgrade edge cases would need
  // subscription history, not just current status, which this schema
  // doesn't retain. Documented simplification, not a silent one.
  const freeRegistered = Math.max(0, totalUsers - trialingSubscriptions - activePaidSubscriptions);
  const unassignedUsersPool = Math.max(0, totalUsers - usersWithActiveRelationship);

  return {
    kpis: {
      totalUsers,
      newUsersLast30d,
      activeUsers30d,
      activePaidUsers: activePaidSubscriptions,
      totalPrograms,
      totalProgramPurchases,
    },
    userGrowth,
    conversionFunnel: {
      freeRegistered,
      trialUsers: trialingSubscriptions,
      convertedPaid: activePaidSubscriptions,
    },
    subscriptionsByTier: Array.from(subscriptionsByTier.values()),
    revenue: {
      totalPaidCents: revenueAgg._sum.amountCents ?? 0,
      failedPayments,
    },
    requiresAttention: {
      openSupportTickets,
      inProgressSupportTickets,
      failedPayments,
      openRefundRequests,
    },
    marketplaceStatus: {
      activeProfessionals,
      pendingProfessionalApplications,
      activeCoachingRelationships,
      unassignedUsersPool,
    },
    recentSignups: recentSignups.map((u: { id: string; fullName: string; email: string; createdAt: Date }) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      createdAt: u.createdAt,
    })),
    // Named exactly so the frontend can render "Not available yet" for
    // these specific spec'd KPIs instead of a fabricated number — see this
    // file's top comment for why each one is cut from this slice.
    notAvailable: ["pendingCoachingRequests", "expiringCredentials"],
  };
}
