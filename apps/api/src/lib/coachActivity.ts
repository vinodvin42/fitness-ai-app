import { prisma } from "../db/prisma";
import { commissionCents } from "./coachFees";

/**
 * Coach activity for the admin console (Oct 2026): sessions, earnings, pricing and booking payments,
 * all read from real `Booking` and `Payment` rows. Replaces the "not available" Sessions / Earnings /
 * Pricing / Payments panels on Professionals and Relationships.
 *
 * Earnings use the same rule as Coach Settlements (adminSettlements.service.ts): a confirmed booking
 * that has already happened (scheduledAt ≤ now) earns its `priceCents` minus the commission at the
 * booking's own `commissionPct`. So these numbers agree with what a settlement would pay.
 *
 * A Relationship has no booking FK (a combined session spans two relationships, see the Booking
 * model's comment), so a relationship's bookings are the member + coach pair's bookings whose
 * offering is for that service type, or for both (an offering without a service type is combined).
 * Booking payments reference the offering (`Payment.referenceId`), so they are matched the same way.
 */

export interface CoachEarnings {
  sessionsDelivered: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
}

type BookingRow = {
  id: string;
  userId: string;
  professionalId: string;
  scheduledAt: Date;
  durationMinutes: number;
  priceCents: number;
  gstCents: number;
  commissionPct: number;
  status: string;
  offering: { serviceType: string | null; service: { serviceType: string | null; label: string } };
};

const BOOKING_SELECT = {
  id: true,
  userId: true,
  professionalId: true,
  scheduledAt: true,
  durationMinutes: true,
  priceCents: true,
  gstCents: true,
  commissionPct: true,
  status: true,
  offering: { select: { serviceType: true, service: { select: { serviceType: true, label: true } } } },
} as const;

function offeringServiceType(b: BookingRow): string | null {
  return b.offering.serviceType ?? b.offering.service.serviceType ?? null;
}

function emptyEarnings(): CoachEarnings {
  return { sessionsDelivered: 0, grossCents: 0, commissionCents: 0, netCents: 0 };
}

function addEarning(e: CoachEarnings, b: Pick<BookingRow, "priceCents" | "commissionPct">) {
  const commission = commissionCents(b.priceCents, b.commissionPct);
  e.sessionsDelivered += 1;
  e.grossCents += b.priceCents;
  e.commissionCents += commission;
  e.netCents += b.priceCents - commission;
}

/** Earnings per coach from delivered, confirmed bookings, optionally only those scheduled in [from, to). */
export async function coachEarnings(
  professionalIds: string[],
  range: { from?: Date; to?: Date } = {},
  now: Date = new Date(),
): Promise<Map<string, CoachEarnings>> {
  const out = new Map<string, CoachEarnings>();
  if (professionalIds.length === 0) return out;
  const upper = range.to && range.to < now ? range.to : now;
  const bookings = (await prisma.booking.findMany({
    where: {
      professionalId: { in: professionalIds },
      status: "confirmed",
      scheduledAt: { ...(range.from ? { gte: range.from } : {}), lte: upper },
    },
    select: { professionalId: true, priceCents: true, commissionPct: true },
  })) as Array<{ professionalId: string; priceCents: number; commissionPct: number }>;
  for (const b of bookings) {
    const e = out.get(b.professionalId) ?? emptyEarnings();
    addEarning(e, b);
    out.set(b.professionalId, e);
  }
  return out;
}

export interface SessionSummary {
  total: number;
  upcoming: number;
  delivered: number;
  cancelled: number;
  lastAt: Date | null;
  nextAt: Date | null;
}

function summarise(bookings: BookingRow[], now: Date): SessionSummary {
  const s: SessionSummary = { total: bookings.length, upcoming: 0, delivered: 0, cancelled: 0, lastAt: null, nextAt: null };
  for (const b of bookings) {
    if (b.status === "cancelled") {
      s.cancelled += 1;
      continue;
    }
    if (b.scheduledAt.getTime() > now.getTime()) {
      s.upcoming += 1;
      if (!s.nextAt || b.scheduledAt < s.nextAt) s.nextAt = b.scheduledAt;
    } else {
      s.delivered += 1;
      if (!s.lastAt || b.scheduledAt > s.lastAt) s.lastAt = b.scheduledAt;
    }
  }
  return s;
}

function sessionItem(b: BookingRow) {
  return {
    bookingId: b.id,
    scheduledAt: b.scheduledAt,
    durationMinutes: b.durationMinutes,
    serviceLabel: b.offering.service.label,
    status: b.status,
    priceCents: b.priceCents,
    gstCents: b.gstCents,
    commissionPct: b.commissionPct,
  };
}

/** A coach's sessions (newest first, up to `limit`) with totals and earnings. */
export async function coachSessions(professionalId: string, limit = 50, now: Date = new Date()) {
  const bookings = (await prisma.booking.findMany({
    where: { professionalId },
    select: { ...BOOKING_SELECT, user: { select: { id: true, fullName: true } } },
    orderBy: { scheduledAt: "desc" },
  })) as Array<BookingRow & { user: { id: string; fullName: string } }>;
  const earnings = emptyEarnings();
  for (const b of bookings) if (b.status === "confirmed" && b.scheduledAt <= now) addEarning(earnings, b);
  return {
    summary: summarise(bookings, now),
    earnings,
    sessions: bookings.slice(0, limit).map((b) => ({ ...sessionItem(b), userId: b.user.id, userFullName: b.user.fullName })),
  };
}

export interface RelationshipKey {
  id: string;
  userId: string;
  professionalId: string;
  serviceType: string;
}

export interface RelationshipActivity {
  sessions: SessionSummary;
  paidCents: number;
  paymentsCount: number;
  /** The newest booking's price (what the member last paid per session, before GST); null with no bookings. */
  lastPriceCents: number | null;
  lastGstCents: number | null;
  commissionPct: number | null;
}

async function loadPairs(rels: RelationshipKey[]) {
  const userIds = [...new Set(rels.map((r) => r.userId))];
  const professionalIds = [...new Set(rels.map((r) => r.professionalId))];
  const [bookings, offerings] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: { in: userIds }, professionalId: { in: professionalIds } },
      select: BOOKING_SELECT,
      orderBy: { scheduledAt: "desc" },
    }) as unknown as Promise<BookingRow[]>,
    prisma.professionalServiceOffering.findMany({
      where: { professionalId: { in: professionalIds } },
      select: { id: true, professionalId: true, serviceType: true, service: { select: { serviceType: true } } },
    }) as unknown as Promise<Array<{ id: string; professionalId: string; serviceType: string | null; service: { serviceType: string | null } }>>,
  ]);
  const payments = offerings.length
    ? ((await prisma.payment.findMany({
        where: { purpose: "booking", userId: { in: userIds }, referenceId: { in: offerings.map((o) => o.id) } },
        select: { id: true, userId: true, referenceId: true, amountCents: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })) as Array<{ id: string; userId: string; referenceId: string; amountCents: number; status: string; createdAt: Date }>)
    : [];
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  return { bookings, payments, offeringById };
}

function matches(serviceType: string | null, relServiceType: string): boolean {
  return serviceType === null || serviceType === relServiceType;
}

function forRelationship(r: RelationshipKey, data: Awaited<ReturnType<typeof loadPairs>>) {
  const bookings = data.bookings.filter(
    (b) => b.userId === r.userId && b.professionalId === r.professionalId && matches(offeringServiceType(b), r.serviceType),
  );
  const payments = data.payments.filter((p) => {
    const o = data.offeringById.get(p.referenceId);
    return !!o && p.userId === r.userId && o.professionalId === r.professionalId && matches(o.serviceType ?? o.service.serviceType, r.serviceType);
  });
  return { bookings, payments };
}

/** Totals per relationship id, for list screens. */
export async function relationshipActivity(rels: RelationshipKey[], now: Date = new Date()): Promise<Map<string, RelationshipActivity>> {
  const out = new Map<string, RelationshipActivity>();
  if (rels.length === 0) return out;
  const data = await loadPairs(rels);
  for (const r of rels) {
    const { bookings, payments } = forRelationship(r, data);
    const paid = payments.filter((p) => p.status === "paid");
    const latest = bookings[0];
    out.set(r.id, {
      sessions: summarise(bookings, now),
      paidCents: paid.reduce((s, p) => s + p.amountCents, 0),
      paymentsCount: paid.length,
      lastPriceCents: latest ? latest.priceCents : null,
      lastGstCents: latest ? latest.gstCents : null,
      commissionPct: latest ? latest.commissionPct : null,
    });
  }
  return out;
}

/** One relationship's sessions and booking payments (newest first, up to `limit` each), for its detail page. */
export async function relationshipHistory(r: RelationshipKey, limit = 50, now: Date = new Date()) {
  const data = await loadPairs([r]);
  const { bookings, payments } = forRelationship(r, data);
  const totals = (await relationshipActivity([r], now)).get(r.id)!;
  return {
    ...totals,
    sessionList: bookings.slice(0, limit).map(sessionItem),
    paymentList: payments.slice(0, limit).map((p) => ({ paymentId: p.id, amountCents: p.amountCents, status: p.status, createdAt: p.createdAt })),
  };
}
