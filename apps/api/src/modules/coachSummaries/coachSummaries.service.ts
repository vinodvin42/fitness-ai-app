import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";

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
  const row = (await prisma.booking.findFirst({
    where: { id: bookingId, professionalId },
    include: INCLUDE,
  })) as BookingRow;
  return {
    ...toBooking(row),
    summaryText: row.summaryText,
    summaryPublishedAt: row.summaryPublishedAt ? row.summaryPublishedAt.toISOString() : null,
  };
}
