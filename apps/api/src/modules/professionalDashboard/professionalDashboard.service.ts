import { prisma } from "../../db/prisma";
import { createActionItem } from "../../lib/adminActionQueue";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Stuck-relationship detection (Wave 3, 20 Sep 2026) — a `Relationship` left
// at `activating` after a real booking-creation failure (see
// coaching.service.ts's createBooking doc comment: "deliberately LEFT at
// `activating` rather than silently reverted or advanced to `active`... an
// honest signal for manual follow-up") had NO signal anywhere for the
// professional side until now — no distinguishing UI, no admin queue entry
// (AdminActionItemType already named `relationship_activation_failed` since
// R2 Wave 1, never actually wired up by any caller). 15 minutes is the
// threshold: the only real code path that sets `activating` (claimRelationship
// -> booking.create() -> the second updateMany back to `active`, all in
// coaching.service.ts's createBooking) is a handful of sequential DB writes
// that normally complete in well under a second, so anything still sitting
// at `activating` 15 minutes later is genuinely stuck, not mid-request — the
// same "generous buffer, not a hair-trigger" reasoning payments.service.ts's
// own activation-failure handling uses. Computed at READ time (no scheduler/
// cron infra exists anywhere in this codebase — same documented precedent
// as every other "would need a cron" gap) inside this already-polled
// dashboard endpoint, not a background sweep.
const STUCK_ACTIVATING_THRESHOLD_MS = 15 * MINUTE_MS;

type TodayBookingRow = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  user: { fullName: string };
  offering: { label: string; serviceType: string | null };
};

type StuckRelationshipRow = {
  id: string;
  serviceType: string;
  updatedAt: Date;
  user: { fullName: string };
};

/**
 * Read-time detection + admin-queue write for `Relationship` rows stuck at
 * `activating` past STUCK_ACTIVATING_THRESHOLD_MS. Runs on every dashboard
 * read (no dedicated poll endpoint exists, and this codebase has no
 * scheduler infra to run it any other way) but is itself idempotent: each
 * stuck relationship gets AT MOST one open AdminActionItem — this checks for
 * an existing (type, entityType, entityId) row with `status: "open"` before
 * creating a new one, the same one-row-per-real-thing dedup discipline
 * `scripts/backfillAdminActionItems.ts` already uses for its own repeatable
 * backfill (see adminActionQueue.ts's own top comment on why createActionItem
 * itself has no dedup baked in — every OTHER call site fires from a genuine
 * one-time event, but this one runs on every poll, so the dedup belongs here).
 * Returns the stuck rows regardless of whether a new AdminActionItem was
 * created, so the coach-mobile client can render an honest banner even on a
 * dashboard read that didn't need to write anything new.
 */
async function detectAndQueueStuckRelationships(professionalId: string): Promise<StuckRelationshipRow[]> {
  const cutoff = new Date(Date.now() - STUCK_ACTIVATING_THRESHOLD_MS);
  const stuck = await prisma.relationship.findMany({
    where: { professionalId, status: "activating", updatedAt: { lt: cutoff } },
    include: { user: { select: { fullName: true } } },
    orderBy: { updatedAt: "asc" },
  });
  const rows = stuck as StuckRelationshipRow[];

  for (const r of rows) {
    const existingOpen = await prisma.adminActionItem.findFirst({
      where: { type: "relationship_activation_failed", entityType: "Relationship", entityId: r.id, status: "open" },
      select: { id: true },
    });
    if (existingOpen) continue;

    await createActionItem({
      type: "relationship_activation_failed",
      entityType: "Relationship",
      entityId: r.id,
      severity: "high",
      metadata: {
        professionalId,
        userFullName: r.user.fullName,
        serviceType: r.serviceType,
        stuckSince: r.updatedAt.toISOString(),
      },
    });
  }

  return rows;
}

/**
 * Coach Dashboard (Phase 5, docs/coach/03-screen-inventory.md §C) — one
 * real endpoint backing all three of the Figma's dashboard variants
 * (fitness-only / nutrition-only / combined), per that doc's own
 * recommendation: "build one dashboard component with service-scoped
 * sections, driven by the coach's verified-services list, rather than
 * three near-duplicate screens." The client (apps/coach-mobile) decides
 * which sections to render from `services` below; this endpoint doesn't
 * pick a variant itself.
 *
 * Real: `activeClients` (a genuine `Relationship` count) — confirming a
 * booking upserts a real `Relationship` row (see coaching.service.ts's
 * `ensureRelationship`), so this count moves as real bookings come in.
 *
 * **26 Aug 2026: `sessionsThisWeek` and `todaysSchedule` are real too**,
 * once `coaching.service.ts`'s `listMySchedule` gave this build its first
 * real professional-facing Booking query to build on. `sessionsThisWeek`
 * is a rolling next-7-days count (not a Mon–Sun calendar week — there's
 * no such boundary defined anywhere else in this build either).
 * `todaysSchedule` uses a UTC calendar day, the same convention
 * `coaching.service.ts`'s fixed 9:00–18:00 availability grid already
 * commits to, not the requester's local timezone (never sent by either
 * client). `avgRating` is still NOT real — no Review model exists
 * anywhere in this build.
 */
export async function getDashboardStats(professionalId: string) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * DAY_MS);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + DAY_MS);

  const [credentials, activeClients, sessionsThisWeek, todaysRows, stuckRelationships] = await Promise.all([
    prisma.professionalCredential.findMany({
      where: { professionalId },
      select: { serviceType: true, status: true },
      orderBy: { serviceType: "asc" },
    }),
    prisma.relationship.count({ where: { professionalId, status: "active" } }),
    prisma.booking.count({
      where: { professionalId, status: "confirmed", scheduledAt: { gte: now, lt: weekFromNow } },
    }),
    prisma.booking.findMany({
      where: { professionalId, status: "confirmed", scheduledAt: { gte: todayStart, lt: todayEnd } },
      include: { user: { select: { fullName: true } }, offering: { select: { label: true, serviceType: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    detectAndQueueStuckRelationships(professionalId),
  ]);

  return {
    services: credentials.map((c: { serviceType: string; status: string }) => ({
      serviceType: c.serviceType,
      verificationStatus: c.status,
    })),
    activeClients,
    sessionsThisWeek,
    todaysSchedule: (todaysRows as TodayBookingRow[]).map((b) => ({
      id: b.id,
      clientFullName: b.user.fullName,
      offeringLabel: b.offering.label,
      serviceType: b.offering.serviceType,
      scheduledAt: b.scheduledAt,
      durationMinutes: b.durationMinutes,
      status: b.status,
    })),
    // Stuck-relationship signal (Wave 3, 20 Sep 2026) — see
    // detectAndQueueStuckRelationships's own doc comment above. Deliberately
    // NOT folded into todaysSchedule/activeClients: a stuck relationship is
    // not `active` (professionalClients.service.ts's Clients list only ever
    // shows `status: "active"` relationships, so these clients don't even
    // appear there today) and isn't a scheduled session either — it's its
    // own honest, distinct signal.
    stuckRelationships: stuckRelationships.map((r) => ({
      relationshipId: r.id,
      clientFullName: r.user.fullName,
      serviceType: r.serviceType,
      stuckSince: r.updatedAt,
    })),
    notAvailable: ["avgRating"],
  };
}

type SettlementHistoryRow = {
  id: string;
  periodStart: Date;
  grossCents: number;
  commissionPct: number;
  commissionCents: number;
  netCents: number;
  status: string;
  paidAt: Date | null;
  // R1: the payout lifecycle gained approval and failure states, and a
  // professional whose transfer bounced needs the reason more than
  // anyone.
  approvedAt: Date | null;
  payoutFailureReason: string | null;
};

/**
 * Coach Earnings (31 Aug 2026) — the coach-facing view of the admin
 * Settlements module (adminSettlements.service.ts). Shows this coach's own
 * current-month booking value net of their configured commission, lifetime
 * paid settlements, and the settlement history. **Update, 6 Sep 2026:**
 * "Gross" here used to mean delivered booking value, not funds actually
 * collected, because coaching bookings didn't run through Razorpay — that
 * changed with PAY-01 (5 Sep 2026, see coaching.service.ts): a `confirmed`
 * Booking with a non-zero price now implies a real captured payment, so
 * gross generally IS collected money now (barring the still-theoretical
 * $0 offering). Any "not funds collected yet" copy on the client should
 * be updated to match — see DashboardScreen.tsx.
 */
export async function getEarnings(professionalId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [professional, monthBookings, settlements] = await Promise.all([
    prisma.professional.findUnique({ where: { id: professionalId }, select: { commissionPct: true } }),
    prisma.booking.findMany({
      where: { professionalId, status: "confirmed", scheduledAt: { gte: monthStart, lt: now } },
      select: { priceCents: true },
    }),
    prisma.coachSettlement.findMany({
      where: { professionalId },
      orderBy: { periodStart: "desc" },
      take: 12,
    }),
  ]);

  const commissionPct = (professional as { commissionPct: number } | null)?.commissionPct ?? 20;
  const monthGrossCents = (monthBookings as { priceCents: number }[]).reduce((sum, b) => sum + b.priceCents, 0);
  const monthCommissionCents = Math.round((monthGrossCents * commissionPct) / 100);

  const history = settlements as SettlementHistoryRow[];
  const lifetimePaidCents = history
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + s.netCents, 0);

  // The §10 payout lifecycle, from the payee's side. `pending` is the
  // spec's PAYOUT_PENDING (see PayoutStatus's own comment), so anything
  // approved-or-later but unpaid is money owed.
  const awaitingPayoutCents = history
    .filter((s) => s.status === "approved" || s.status === "pending")
    .reduce((sum, s) => sum + s.netCents, 0);
  const failedPayouts = history.filter((s) => s.status === "payout_failed");

  return {
    commissionPct,
    currentMonth: {
      grossCents: monthGrossCents,
      commissionCents: monthCommissionCents,
      netCents: monthGrossCents - monthCommissionCents,
      // The current-month figure is derived from per-session bookings,
      // which only exist under the marketplace model that decision #4
      // turns off. Under controlled assignment a professional's income
      // comes from settlements, not sessions, so this reads zero and
      // saying so is better than a professional concluding they earned
      // nothing this month.
      derivedFromBookings: true,
      hasBookingData: monthBookings.length > 0,
    },
    lifetimePaidCents,
    awaitingPayoutCents,
    // Surfaced separately so the app can lead with it: a bounced transfer
    // is usually the professional's own bank details, and every day it
    // goes unnoticed is a day they are not paid.
    payoutFailure:
      failedPayouts.length > 0
        ? {
            count: failedPayouts.length,
            amountCents: failedPayouts.reduce((sum, s) => sum + s.netCents, 0),
            reason: failedPayouts[0].payoutFailureReason,
          }
        : null,
    settlements: history.map((s) => ({
      id: s.id,
      periodStart: s.periodStart,
      grossCents: s.grossCents,
      commissionPct: s.commissionPct,
      netCents: s.netCents,
      status: s.status,
      approvedAt: s.approvedAt,
      paidAt: s.paidAt,
      payoutFailureReason: s.payoutFailureReason,
    })),
  };
}
