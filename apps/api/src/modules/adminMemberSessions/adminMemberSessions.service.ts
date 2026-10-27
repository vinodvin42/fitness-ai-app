import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * Member sessions & credits for admins (27 Oct 2026 gap fix). A read-only
 * view of one member's coach bookings and their session credits, so support
 * and ops can answer "what happened to my session / my credit" without a
 * database query. Nothing here changes a booking or a credit, and nothing is
 * audited (it is a read, like the rest of the user profile).
 *
 * `paidWith`:
 * - "credit"  — the booking was paid with a SessionCredit (paidWithCreditId).
 * - "payment" — the booking has a fee. `paymentId` is the Razorpay Payment
 *   when the booking stores it; bookings made before 27 Oct 2026 don't, so
 *   it can be null for a paid booking (we don't guess which payment it was).
 * - "free"    — fee + GST is zero and no credit was used.
 */

const SESSIONS_LIMIT = 200;

export type PaidWith = "payment" | "credit" | "free";
export type CreditState = "available" | "used" | "expired";

type BookingRow = {
  id: string;
  professionalId: string;
  scheduledAt: Date;
  durationMinutes: number;
  priceCents: number;
  gstCents: number;
  status: "confirmed" | "cancelled";
  createdAt: Date;
  paymentId: string | null;
  paidWithCreditId: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  proposedScheduledAt: Date | null;
  proposedAt: Date | null;
  professional: { fullName: string };
  offering: { label: string; serviceType: string | null };
  credit: { id: string; amountCents: number; expiresAt: Date; usedAt: Date | null } | null;
};

type CreditRow = {
  id: string;
  amountCents: number;
  reason: string;
  sourceBookingId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  sourceBooking: { scheduledAt: Date; professional: { fullName: string }; offering: { label: string } };
  usedBooking: { id: string; scheduledAt: Date; professional: { fullName: string } } | null;
};

export function paidWithOf(b: { paidWithCreditId: string | null; paymentId: string | null; priceCents: number; gstCents: number }): PaidWith {
  if (b.paidWithCreditId) return "credit";
  if (b.paymentId) return "payment";
  return b.priceCents + b.gstCents > 0 ? "payment" : "free";
}

export function creditStateOf(c: { usedAt: Date | null; expiresAt: Date }, now: Date): CreditState {
  if (c.usedAt) return "used";
  return c.expiresAt.getTime() <= now.getTime() ? "expired" : "available";
}

export async function getMemberSessions(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new ApiHttpError(404, "not_found", "User not found");

  const now = new Date();
  const [bookings, credits] = (await Promise.all([
    prisma.booking.findMany({
      where: { userId },
      orderBy: { scheduledAt: "desc" },
      take: SESSIONS_LIMIT,
      select: {
        id: true,
        professionalId: true,
        scheduledAt: true,
        durationMinutes: true,
        priceCents: true,
        gstCents: true,
        status: true,
        createdAt: true,
        paymentId: true,
        paidWithCreditId: true,
        cancelledAt: true,
        cancelledBy: true,
        cancelReason: true,
        proposedScheduledAt: true,
        proposedAt: true,
        professional: { select: { fullName: true } },
        offering: { select: { label: true, serviceType: true } },
        credit: { select: { id: true, amountCents: true, expiresAt: true, usedAt: true } },
      },
    }),
    prisma.sessionCredit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        reason: true,
        sourceBookingId: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        sourceBooking: { select: { scheduledAt: true, professional: { select: { fullName: true } }, offering: { select: { label: true } } } },
        usedBooking: { select: { id: true, scheduledAt: true, professional: { select: { fullName: true } } } },
      },
    }),
  ])) as [BookingRow[], CreditRow[]];

  return {
    userId,
    sessions: bookings.map((b) => ({
      bookingId: b.id,
      professionalId: b.professionalId,
      coachName: b.professional.fullName,
      offeringLabel: b.offering.label,
      serviceType: b.offering.serviceType,
      scheduledAt: b.scheduledAt,
      durationMinutes: b.durationMinutes,
      status: b.status,
      cancelledAt: b.cancelledAt,
      cancelledBy: b.cancelledBy,
      cancelReason: b.cancelReason,
      // A proposal is ignored once the session's own start has passed (see Booking.proposedScheduledAt).
      proposedScheduledAt: b.status === "confirmed" && b.scheduledAt > now ? b.proposedScheduledAt : null,
      proposedAt: b.status === "confirmed" && b.scheduledAt > now ? b.proposedAt : null,
      priceCents: b.priceCents,
      gstCents: b.gstCents,
      paidWith: paidWithOf(b),
      paymentId: b.paymentId,
      paidWithCreditId: b.paidWithCreditId,
      creditIssued: b.credit
        ? { id: b.credit.id, amountCents: b.credit.amountCents, expiresAt: b.credit.expiresAt, usedAt: b.credit.usedAt, state: creditStateOf(b.credit, now) }
        : null,
      createdAt: b.createdAt,
    })),
    credits: credits.map((c) => ({
      id: c.id,
      amountCents: c.amountCents,
      reason: c.reason,
      state: creditStateOf(c, now),
      expiresAt: c.expiresAt,
      usedAt: c.usedAt,
      createdAt: c.createdAt,
      sourceBooking: {
        bookingId: c.sourceBookingId,
        scheduledAt: c.sourceBooking.scheduledAt,
        coachName: c.sourceBooking.professional.fullName,
        offeringLabel: c.sourceBooking.offering.label,
      },
      usedBooking: c.usedBooking
        ? { bookingId: c.usedBooking.id, scheduledAt: c.usedBooking.scheduledAt, coachName: c.usedBooking.professional.fullName }
        : null,
    })),
  };
}
