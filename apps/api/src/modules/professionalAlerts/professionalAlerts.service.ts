import { prisma } from "../../db/prisma";
import { REQUEST_REPLY_WINDOW_MS } from "../../lib/relationshipActivation";
import type { AlertsQuery } from "./professionalAlerts.schema";

const NEW_BOOKINGS_LIMIT = 20;

type NewBookingRow = {
  id: string;
  userId: string;
  scheduledAt: Date;
  durationMinutes: number;
  createdAt: Date;
  user: { fullName: string };
  offering: { label: string };
};

/**
 * What the coach app's Alerts badge polls (25 Oct 2026, coach communication
 * audit B2: the coach was never told about a new request, booking or Fynrox
 * offer unless they opened the right screen). There is no professional inbox
 * model, so this counts the rows that already exist instead of creating
 * notification rows:
 *
 * - Requests and offers count while they wait for the coach. Accepting,
 *   declining or letting one lapse is what clears it, so there is nothing to
 *   mark as read.
 * - Bookings need no action, so they count once: the confirmed ones made
 *   after `bookingsSince`. The app sends the `asOf` of the read it showed the
 *   coach, so both sides of the comparison are server time.
 *
 * Read-only, because the app polls it. The lists that act on these rows
 * (listPendingRelationships, listOffersForProfessional) still do the lazy
 * expiry; the counts here use the same cut-offs so a lapsed request or offer
 * isn't counted in the meantime.
 */
export async function getAlerts(professionalId: string, query: AlertsQuery) {
  const now = new Date();
  const replyCutoff = new Date(now.getTime() - REQUEST_REPLY_WINDOW_MS);
  const newBookingsWhere = query.bookingsSince
    ? { professionalId, status: "confirmed" as const, createdAt: { gt: new Date(query.bookingsSince) } }
    : null;

  const [pendingRequests, openOffers, newBookingRows, newBookingCount] = await Promise.all([
    prisma.relationship.count({
      where: {
        professionalId,
        status: "requested",
        OR: [{ requestedAt: { gte: replyCutoff } }, { requestedAt: null, createdAt: { gte: replyCutoff } }],
      },
    }),
    prisma.professionalOffer.count({
      where: { professionalId, status: "offered", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    newBookingsWhere
      ? prisma.booking.findMany({
          where: newBookingsWhere,
          include: { user: { select: { fullName: true } }, offering: { select: { label: true } } },
          orderBy: { createdAt: "desc" },
          take: NEW_BOOKINGS_LIMIT,
        })
      : Promise.resolve([]),
    newBookingsWhere ? prisma.booking.count({ where: newBookingsWhere }) : Promise.resolve(0),
  ]);

  return {
    pendingRequests,
    openOffers,
    newBookings: (newBookingRows as NewBookingRow[]).map((b) => ({
      id: b.id,
      clientId: b.userId,
      clientFullName: b.user.fullName,
      offeringLabel: b.offering.label,
      scheduledAt: b.scheduledAt,
      durationMinutes: b.durationMinutes,
      bookedAt: b.createdAt,
    })),
    newBookingCount,
    asOf: now,
  };
}
