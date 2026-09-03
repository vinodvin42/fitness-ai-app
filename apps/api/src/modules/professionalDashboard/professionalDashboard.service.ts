import { prisma } from "../../db/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

type TodayBookingRow = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  user: { fullName: string };
  offering: { label: string; serviceType: string | null };
};

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

  const [credentials, activeClients, sessionsThisWeek, todaysRows] = await Promise.all([
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
};

/**
 * Coach Earnings (31 Aug 2026) — the coach-facing view of the admin
 * Settlements module (adminSettlements.service.ts). Shows this coach's own
 * current-month booking value net of their configured commission, lifetime
 * paid settlements, and the settlement history. "Gross" is delivered
 * booking value, not funds collected — coaching bookings don't run through
 * Razorpay yet (see coaching.service.ts); labelled honestly on the client.
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

  return {
    commissionPct,
    currentMonth: {
      grossCents: monthGrossCents,
      commissionCents: monthCommissionCents,
      netCents: monthGrossCents - monthCommissionCents,
    },
    lifetimePaidCents,
    settlements: history.map((s) => ({
      id: s.id,
      periodStart: s.periodStart,
      grossCents: s.grossCents,
      commissionPct: s.commissionPct,
      netCents: s.netCents,
      status: s.status,
      paidAt: s.paidAt,
    })),
  };
}
