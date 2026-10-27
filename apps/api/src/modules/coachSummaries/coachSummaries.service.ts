import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { RateSessionInput } from "./coachSummaries.schema";
import { notifyMemberOfSummary } from "../coaching/memberNotices";
import { notifyCoachOfRating } from "../professionalNotifications/professionalNotices";

/**
 * Human Coach 04-09 — session summary. The summary is the coach's own
 * client-visible write-up, stored on Booking (summaryText/summaryPublishedAt).
 * It is distinct from CoachNote, which stays private to the professional.
 */

type BookingRow = {
  id: string;
  professionalId: string;
  scheduledAt: Date;
  durationMinutes: number;
  priceCents: number;
  status: string;
  summaryText: string | null;
  summaryPublishedAt: Date | null;
  proposedScheduledAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  professional: { fullName: string };
  offering: { label: string; serviceType: string | null };
};

function toBooking(b: BookingRow) {
  return {
    id: b.id,
    professionalId: b.professionalId,
    professionalFullName: b.professional.fullName,
    offeringLabel: b.offering.label,
    serviceType: b.offering.serviceType,
    scheduledAt: b.scheduledAt.toISOString(),
    durationMinutes: b.durationMinutes,
    priceCents: b.priceCents,
    status: b.status as "confirmed" | "cancelled",
    hasSummary: b.summaryPublishedAt != null,
    // Booking changes (27 Oct 2026): a time the coach proposed, waiting for the member's answer.
    proposedScheduledAt: b.proposedScheduledAt ? b.proposedScheduledAt.toISOString() : null,
    cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
    cancelledBy: b.cancelledBy,
  };
}

const INCLUDE = {
  professional: { select: { fullName: true } },
  offering: { select: { label: true, serviceType: true } },
};

export async function listMyBookings(userId: string) {
  const rows = (await prisma.booking.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: { scheduledAt: "desc" },
    take: 100,
  })) as BookingRow[];
  return { items: rows.map(toBooking) };
}

export async function getBookingSummary(userId: string, bookingId: string) {
  const row = (await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: INCLUDE,
  })) as BookingRow | null;
  if (!row) throw new ApiHttpError(404, "booking_not_found", "Booking not found");
  return {
    ...toBooking(row),
    summaryText: row.summaryText,
    summaryPublishedAt: row.summaryPublishedAt ? row.summaryPublishedAt.toISOString() : null,
  };
}

const ratingView = (r: { stars: number; tags: string[]; comment: string | null; updatedAt: Date }) => ({
  stars: r.stars,
  tags: r.tags,
  comment: r.comment,
  updatedAt: r.updatedAt.toISOString(),
});

/** The member's own rating of one of their sessions, or null (Figma coach/11). */
export async function getMySessionRating(userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId }, select: { id: true } });
  if (!booking) throw new ApiHttpError(404, "booking_not_found", "Booking not found");
  const rating = await prisma.sessionRating.findUnique({ where: { bookingId } });
  return { bookingId, rating: rating ? ratingView(rating) : null };
}

/**
 * Rate a session (24 Oct 2026, private to the coach). Only the member's own,
 * confirmed session, once it has started; a new answer replaces the old one.
 */
export async function rateSession(userId: string, bookingId: string, input: RateSessionInput) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw new ApiHttpError(404, "booking_not_found", "Booking not found");
  if (booking.status !== "confirmed") {
    throw new ApiHttpError(409, "booking_not_ratable", "Only a session that took place can be rated");
  }
  if (booking.scheduledAt.getTime() > Date.now()) {
    throw new ApiHttpError(409, "session_not_started", "You can rate a session once it has started");
  }
  const data = { stars: input.stars, tags: [...new Set(input.tags)], comment: input.comment ? input.comment : null };
  const hadRating = (await prisma.sessionRating.count({ where: { bookingId } })) > 0;
  const rating = await prisma.sessionRating.upsert({
    where: { bookingId },
    create: { bookingId, userId, professionalId: booking.professionalId, ...data },
    update: data,
  });
  await recordAudit({
    actorId: userId,
    action: "booking.rated",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { stars: input.stars },
  });
  // The coach's inbox (27 Oct 2026): the rating is private to them, so they're the one to tell.
  await notifyCoachOfRating(bookingId, hadRating);
  return { bookingId, rating: ratingView(rating) };
}

/**
 * The coach's feedback, newest first, with the average; optionally one client's.
 * The list is capped at the latest 100; the count and average cover every
 * rating (27 Oct 2026: they used to cover only the listed 100).
 */
export async function listMyRatings(professionalId: string, clientId?: string) {
  const where = { professionalId, ...(clientId ? { userId: clientId } : {}) };
  const [rows, totals] = await Promise.all([
    prisma.sessionRating.findMany({
      where,
      include: {
        user: { select: { fullName: true } },
        booking: { select: { scheduledAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.sessionRating.aggregate({ where, _count: { _all: true }, _avg: { stars: true } }),
  ]);
  const avg = totals._avg.stars;
  const average = totals._count._all > 0 && avg != null ? Math.round(avg * 10) / 10 : null;
  return {
    count: totals._count._all,
    average,
    items: rows.map((r) => ({
      bookingId: r.bookingId,
      clientFullName: r.user.fullName,
      scheduledAt: r.booking.scheduledAt.toISOString(),
      ...ratingView(r),
    })),
  };
}

export async function publishBookingSummary(professionalId: string, bookingId: string, summaryText: string) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, professionalId } });
  if (!booking) throw new ApiHttpError(404, "booking_not_found", "Booking not found");
  if (booking.status !== "confirmed") {
    throw new ApiHttpError(409, "booking_not_summarizable", "Only a confirmed session can have a summary");
  }
  if (booking.scheduledAt.getTime() > Date.now()) {
    throw new ApiHttpError(409, "session_not_started", "A summary can only be published once the session has started");
  }
  await prisma.booking.update({
    where: { id: booking.id },
    data: { summaryText, summaryPublishedAt: new Date() },
  });
  await recordAudit({
    actorProfessionalId: professionalId,
    action: "booking.summary_published",
    entityType: "Booking",
    entityId: booking.id,
    metadata: { userId: booking.userId },
  });
  // Tell the member on the first publish only; later edits stay quiet.
  if (!booking.summaryPublishedAt) {
    const professional = await prisma.professional
      .findUnique({ where: { id: professionalId }, select: { fullName: true } })
      .catch(() => null);
    await notifyMemberOfSummary(booking.userId, professional?.fullName ?? null);
  }
  return getMyBookingSummary(professionalId, bookingId);
}

/**
 * The coach's read-back of a session's summary (25 Oct 2026), so the coach
 * app can show what was published after a reload. Only the professional's own
 * bookings; the text is null until one is published.
 */
export async function getMyBookingSummary(professionalId: string, bookingId: string) {
  const row = (await prisma.booking.findFirst({
    where: { id: bookingId, professionalId },
    include: INCLUDE,
  })) as BookingRow | null;
  if (!row) throw new ApiHttpError(404, "booking_not_found", "Booking not found");
  return {
    ...toBooking(row),
    summaryText: row.summaryText,
    summaryPublishedAt: row.summaryPublishedAt ? row.summaryPublishedAt.toISOString() : null,
  };
}
