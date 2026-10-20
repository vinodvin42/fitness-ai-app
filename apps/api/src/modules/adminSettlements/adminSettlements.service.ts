import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { commissionCents as commissionOn, commissionPctFor } from "../../lib/coachFees";
import { ListSettlementsQuery, SetCommissionInput, SettleCoachInput } from "./adminSettlements.schema";

/**
 * Module 10.06 — Coach Settlements (docs/admin/03-screen-inventory.md),
 * added 31 Aug 2026 — the "money out to coaches" module the roadmap left
 * blocked on a take-rate decision. **Package 4 (Oct 2026):** FynroX's
 * commission is the versioned `CommissionRate` table (default + per-coach
 * override, lib/coachFees.ts), and each Booking copies the rate when it is
 * made. A settlement sums each booking's own commission, so a rate change
 * never recomputes past bookings or settlements.
 *
 * A settlement is computed from the real `Booking` value a coach delivered
 * in a UTC calendar month: gross = Σ priceCents of that coach's confirmed,
 * already-delivered (scheduledAt ≤ now) bookings in the period; commission =
 * gross × commissionPct%; net payable = gross − commission. **Update, 6 Sep
 * 2026:** this used to say coaching bookings don't run through Razorpay, so
 * "gross" was booking value delivered, not funds actually collected — that
 * changed with PAY-01 (5 Sep 2026, see coaching.service.ts): a `confirmed`
 * Booking with a non-zero price now requires a verified Razorpay payment
 * before it's created, so gross generally IS real collected money now.
 * Marking a settlement paid records a real `Expense` row (category
 * `coach_settlement`) so the payout flows into Module 10 Finance's ledger
 * rather than being a parallel money concept.
 *
 * **Known, undecided edge case (flagged 6 Sep 2026, not fixed — a real
 * business-policy call, not a bug this file should silently pick one side
 * of):** gross here sums `Booking.priceCents`, the offering's full list
 * price at booking time — NOT `Payment.amountCents`, the amount actually
 * charged after a coupon discount (coupons on bookings shipped 5 Sep 2026
 * alongside PAY-01). So a coach is currently settled on the full list
 * price even when the platform collected less via a coupon — implicitly
 * treating the discount as a cost the platform absorbs, not one the coach
 * shares in. That may be exactly the right policy, but it was never an
 * explicit decision; worth a deliberate call (settle on list price, or on
 * actually-collected `Payment.amountCents`) rather than leaving it as an
 * accident of which field this query happened to read.
 *
 * Deliberately does NOT import Prisma model types — the un-generated
 * `@prisma/client` stub has no real model exports in this sandbox.
 */

// Oct 2026: nothing missing — what is owed shows per row (eligible / approved
// / pending) and in total on the Finance dashboard.
const SETTLEMENTS_NOT_AVAILABLE: string[] = [];

function monthBounds(month?: string): { periodStart: Date; periodEnd: Date; monthKey: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let mon = now.getUTCMonth(); // 0-based
  if (month) {
    const [y, m] = month.split("-").map((n) => Number(n));
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 1 && m <= 12) {
      year = y;
      mon = m - 1;
    }
  }
  const periodStart = new Date(Date.UTC(year, mon, 1));
  const periodEnd = new Date(Date.UTC(year, mon + 1, 1));
  const monthKey = `${year}-${String(mon + 1).padStart(2, "0")}`;
  return { periodStart, periodEnd, monthKey };
}

type BookingRow = {
  professionalId: string;
  priceCents: number;
  commissionPct: number;
  professional: { fullName: string; status: string };
};

type SettlementRow = {
  id: string;
  professionalId: string;
  status: string;
  paidAt: Date | null;
  netCents: number;
};

/** Gross, commission and net from bookings, each at its own copied rate. */
function totalsFor(bookings: Array<{ priceCents: number; commissionPct: number }>) {
  let grossCents = 0;
  let commissionCents = 0;
  for (const b of bookings) {
    grossCents += b.priceCents;
    commissionCents += commissionOn(b.priceCents, b.commissionPct);
  }
  // The effective rate across the month, for display (rates can differ
  // between bookings if FynroX changed it mid-month).
  const effectivePct = grossCents > 0 ? Math.round((commissionCents * 100) / grossCents) : 0;
  return { grossCents, commissionCents, netCents: grossCents - commissionCents, effectivePct };
}

export async function listSettlements(query: ListSettlementsQuery) {
  const { periodStart, periodEnd, monthKey } = monthBounds(query.month);
  const now = new Date();
  const deliveredBefore = periodEnd.getTime() < now.getTime() ? periodEnd : now;

  const [bookings, existing] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: "confirmed",
        scheduledAt: { gte: periodStart, lt: deliveredBefore },
      },
      select: {
        professionalId: true,
        priceCents: true,
        commissionPct: true,
        professional: { select: { fullName: true, status: true } },
      },
    }),
    prisma.coachSettlement.findMany({ where: { periodStart } }),
  ]);

  const settledByPro = new Map<string, SettlementRow>();
  for (const s of existing as SettlementRow[]) settledByPro.set(s.professionalId, s);

  // Aggregate booking value per professional.
  const agg = new Map<string, { name: string; bookings: Array<{ priceCents: number; commissionPct: number }> }>();
  for (const b of bookings as BookingRow[]) {
    const cur = agg.get(b.professionalId) ?? { name: b.professional.fullName, bookings: [] };
    cur.bookings.push({ priceCents: b.priceCents, commissionPct: b.commissionPct });
    agg.set(b.professionalId, cur);
  }
  // The rate each coach's NEW bookings get today (shown beside the month's
  // effective rate; changing it never touches the month's bookings).
  const currentRates = await commissionPctFor([...agg.keys()]);

  const rows = [...agg.entries()].map(([professionalId, a]) => {
    const { grossCents, commissionCents, netCents, effectivePct } = totalsFor(a.bookings);
    const settlement = settledByPro.get(professionalId);
    return {
      professionalId,
      professionalName: a.name,
      commissionPct: effectivePct,
      currentCommissionPct: currentRates.get(professionalId) ?? effectivePct,
      grossCents,
      commissionCents,
      netCents,
      bookingCount: a.bookings.length,
      settlement: settlement
        ? { id: settlement.id, status: settlement.status, paidAt: settlement.paidAt }
        : null,
    };
  });

  rows.sort((x, y) => y.netCents - x.netCents);

  const summary = rows.reduce(
    (acc, r) => {
      acc.grossCents += r.grossCents;
      acc.commissionCents += r.commissionCents;
      acc.netCents += r.netCents;
      if (!r.settlement || r.settlement.status !== "paid") acc.unsettledNetCents += r.netCents;
      return acc;
    },
    { grossCents: 0, commissionCents: 0, netCents: 0, unsettledNetCents: 0 },
  );

  return { month: monthKey, periodStart, periodEnd, rows, summary, notAvailable: SETTLEMENTS_NOT_AVAILABLE };
}

/**
 * Set this coach's own commission rate from now on (a new versioned
 * CommissionRate override row — Package 4). Only new bookings get it;
 * existing bookings and settlements keep the rate they were made at.
 */
export async function setCommission(actorAdminId: string, professionalId: string, input: SetCommissionInput) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { id: true },
  });
  if (!professional) {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }
  const before = (await commissionPctFor([professionalId])).get(professionalId);
  const rate = await prisma.commissionRate.create({
    data: {
      professionalId,
      pct: input.commissionPct,
      effectiveFrom: new Date(),
      reason: input.reason ?? null,
      createdByAdminId: actorAdminId,
    },
  });
  await recordAudit({
    actorAdminId,
    action: "coach.commission_updated",
    entityType: "Professional",
    entityId: professionalId,
    stateBefore: { commissionPct: before },
    stateAfter: { commissionPct: input.commissionPct },
    metadata: { commissionRateId: rate.id, appliesTo: "new bookings only" },
  });
  return { professionalId, commissionPct: input.commissionPct };
}

/**
 * Settle one coach for one month: recompute gross from real bookings (never
 * trust a client-sent amount) and persist a CoachSettlement as **eligible**
 * (owed). Oct 2026: it is then approved (Payout Runs) and paid by a payout
 * run, which records the Finance Expense (category coach_settlement) for
 * what was actually paid. The unique on (professionalId, periodStart) makes
 * double-settling a month a 409, not a duplicate payout.
 */
export async function settleCoach(actorAdminId: string, input: SettleCoachInput) {
  const { periodStart, periodEnd } = monthBounds(input.month);
  const now = new Date();
  const deliveredBefore = periodEnd.getTime() < now.getTime() ? periodEnd : now;

  const existing = await prisma.coachSettlement.findUnique({
    where: { professionalId_periodStart: { professionalId: input.professionalId, periodStart } },
  });
  if (existing) {
    throw new ApiHttpError(409, "already_settled", "This coach is already settled for that month");
  }

  const professional = await prisma.professional.findUnique({
    where: { id: input.professionalId },
    select: { id: true, fullName: true },
  });
  const prof = professional as { id: string; fullName: string } | null;
  if (!prof) {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }

  const bookings = await prisma.booking.findMany({
    where: { professionalId: input.professionalId, status: "confirmed", scheduledAt: { gte: periodStart, lt: deliveredBefore } },
    select: { priceCents: true, commissionPct: true },
  });
  const { grossCents, commissionCents, netCents, effectivePct } = totalsFor(
    bookings as Array<{ priceCents: number; commissionPct: number }>,
  );
  if (grossCents <= 0) {
    throw new ApiHttpError(422, "nothing_to_settle", "This coach has no delivered bookings to settle for that month");
  }

  const settlement = await prisma.coachSettlement.create({
    data: {
      professionalId: input.professionalId,
      periodStart,
      periodEnd,
      grossCents,
      commissionPct: effectivePct,
      commissionCents,
      netCents,
      status: "eligible",
      note: input.note ?? null,
    },
  });

  // Spec §11 `earning.eligible` — the moment a professional's work
  // becomes money owed. Audit rather than analytics: the payee is a
  // Professional, and trackEvent is keyed to a consumer `userId` it
  // would have to invent here.
  await recordAudit({
    actorAdminId: actorAdminId,
    action: "earning.eligible",
    entityType: "CoachSettlement",
    entityId: settlement.id,
    ruleId: "BR-COM-012",
    stateAfter: { status: settlement.status, netCents },
    metadata: { professionalId: input.professionalId, grossCents, commissionCents },
  });

  await recordAudit({
    actorAdminId,
    action: "coach_settlement.recorded",
    entityType: "CoachSettlement",
    entityId: settlement.id,
    metadata: { professionalId: input.professionalId, grossCents, netCents, commissionPct: effectivePct },
  });

  return settlement;
}
