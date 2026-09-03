import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ListSettlementsQuery, SetCommissionInput, SettleCoachInput } from "./adminSettlements.schema";

/**
 * Module 10.06 — Coach Settlements (docs/admin/03-screen-inventory.md),
 * added 31 Aug 2026 — the "money out to coaches" module the roadmap left
 * blocked on a take-rate decision. Decision made: **configurable per-coach
 * commission** (`Professional.commissionPct`, admin-editable here and on the
 * Module 03 Professional profile).
 *
 * A settlement is computed from the real `Booking` value a coach delivered
 * in a UTC calendar month: gross = Σ priceCents of that coach's confirmed,
 * already-delivered (scheduledAt ≤ now) bookings in the period; commission =
 * gross × commissionPct%; net payable = gross − commission. Coaching
 * bookings don't run through Razorpay yet (see coaching.service.ts), so
 * "gross" is booking value delivered, honestly labelled — not funds
 * actually collected. Marking a settlement paid records a real `Expense`
 * row (category `coach_settlement`) so the payout flows into Module 10
 * Finance's ledger rather than being a parallel money concept.
 *
 * Deliberately does NOT import Prisma model types — the un-generated
 * `@prisma/client` stub has no real model exports in this sandbox.
 */

const SETTLEMENTS_NOT_AVAILABLE = ["pendingPayouts"];

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
  professional: { fullName: string; commissionPct: number; status: string };
};

type SettlementRow = {
  id: string;
  professionalId: string;
  status: string;
  paidAt: Date | null;
  netCents: number;
};

function commissionFor(grossCents: number, pct: number) {
  const commissionCents = Math.round((grossCents * pct) / 100);
  return { commissionCents, netCents: grossCents - commissionCents };
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
        professional: { select: { fullName: true, commissionPct: true, status: true } },
      },
    }),
    prisma.coachSettlement.findMany({ where: { periodStart } }),
  ]);

  const settledByPro = new Map<string, SettlementRow>();
  for (const s of existing as SettlementRow[]) settledByPro.set(s.professionalId, s);

  // Aggregate booking value per professional.
  const agg = new Map<string, { name: string; pct: number; grossCents: number; bookingCount: number }>();
  for (const b of bookings as BookingRow[]) {
    const cur = agg.get(b.professionalId) ?? {
      name: b.professional.fullName,
      pct: b.professional.commissionPct,
      grossCents: 0,
      bookingCount: 0,
    };
    cur.grossCents += b.priceCents;
    cur.bookingCount += 1;
    agg.set(b.professionalId, cur);
  }

  const rows = [...agg.entries()].map(([professionalId, a]) => {
    const { commissionCents, netCents } = commissionFor(a.grossCents, a.pct);
    const settlement = settledByPro.get(professionalId);
    return {
      professionalId,
      professionalName: a.name,
      commissionPct: a.pct,
      grossCents: a.grossCents,
      commissionCents,
      netCents,
      bookingCount: a.bookingCount,
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

export async function setCommission(actorAdminId: string, professionalId: string, input: SetCommissionInput) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { id: true },
  });
  if (!professional) {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }
  await prisma.professional.update({ where: { id: professionalId }, data: { commissionPct: input.commissionPct } });
  await recordAudit({
    actorAdminId,
    action: "coach.commission_updated",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { commissionPct: input.commissionPct },
  });
  return { professionalId, commissionPct: input.commissionPct };
}

/**
 * Settle one coach for one month: recompute gross from real bookings (never
 * trust a client-sent amount), persist a CoachSettlement, and record a real
 * Expense (category coach_settlement) so it lands in Finance's ledger. The
 * unique on (professionalId, periodStart) makes double-settling a month a
 * 409, not a duplicate payout.
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
    select: { id: true, fullName: true, commissionPct: true },
  });
  const prof = professional as { id: string; fullName: string; commissionPct: number } | null;
  if (!prof) {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }

  const bookings = await prisma.booking.findMany({
    where: { professionalId: input.professionalId, status: "confirmed", scheduledAt: { gte: periodStart, lt: deliveredBefore } },
    select: { priceCents: true },
  });
  const grossCents = (bookings as { priceCents: number }[]).reduce((sum, b) => sum + b.priceCents, 0);
  if (grossCents <= 0) {
    throw new ApiHttpError(422, "nothing_to_settle", "This coach has no delivered bookings to settle for that month");
  }
  const { commissionCents, netCents } = commissionFor(grossCents, prof.commissionPct);

  const settlement = await prisma.coachSettlement.create({
    data: {
      professionalId: input.professionalId,
      periodStart,
      periodEnd,
      grossCents,
      commissionPct: prof.commissionPct,
      commissionCents,
      netCents,
      status: "paid",
      paidAt: now,
      note: input.note ?? null,
    },
  });

  // Flow the payout into Finance's real ledger.
  await prisma.expense.create({
    data: {
      category: "coach_settlement",
      description: `Coach settlement — ${prof.fullName} (${input.month ?? monthBounds().monthKey})`,
      amountCents: netCents,
      status: "paid",
      incurredAt: now,
      recordedByAdminId: actorAdminId,
      paidAt: now,
      notes: input.note ?? null,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "coach_settlement.paid",
    entityType: "CoachSettlement",
    entityId: settlement.id,
    metadata: { professionalId: input.professionalId, grossCents, netCents, commissionPct: prof.commissionPct },
  });

  return settlement;
}
