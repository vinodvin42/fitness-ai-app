import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { priceOffering } from "../../lib/coachFees";
import { createBooking, isOnSlotGrid, slotIsFree } from "../coaching/coaching.service";
import { createNotification } from "../notifications/notifications.service";
import { notifyProfessional } from "../professionalNotifications/professionalNotifications.service";

/**
 * Booking changes (27 Oct 2026). The owner's policy:
 * - A member can cancel a session any time before it starts. There is no
 *   cash refund from the app: they get a session credit worth what they paid
 *   (fee + GST, after any coupon), usable on any coach's session for
 *   CREDIT_VALIDITY_DAYS.
 * - A coach can't cancel; they propose a new time, at least
 *   COACH_PROPOSAL_MIN_NOTICE_MS before the session. The member accepts (the
 *   session moves) or declines (it's cancelled and they get the credit).
 *   An unanswered proposal lapses when the session starts; the session stays
 *   as booked.
 * - A credit pays for one session whose full price it covers; the difference
 *   isn't refunded. Spending one doesn't touch Razorpay at all.
 * The member's own reschedule (coaching.service.ts rescheduleBooking) is
 * unchanged and clears any open proposal.
 *
 * The defaults the owner left to us ("no preference"): credit value = amount
 * paid, valid 90 days, any coach; coach proposals need 12 hours' notice.
 */
export const CREDIT_VALIDITY_DAYS = 90;
export const COACH_PROPOSAL_MIN_NOTICE_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const sessionLink = (bookingId: string) => `coach-session?bookingId=${encodeURIComponent(bookingId)}`;

const when = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const rupees = (cents: number) => `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type BookingForChange = {
  id: string;
  userId: string;
  professionalId: string;
  scheduledAt: Date;
  durationMinutes: number;
  priceCents: number;
  gstCents: number;
  status: string;
  paymentId: string | null;
  proposedScheduledAt: Date | null;
  user: { fullName: string };
  professional: { fullName: string };
};

async function loadBooking(bookingId: string): Promise<BookingForChange | null> {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      userId: true,
      professionalId: true,
      scheduledAt: true,
      durationMinutes: true,
      priceCents: true,
      gstCents: true,
      status: true,
      paymentId: true,
      proposedScheduledAt: true,
      user: { select: { fullName: true } },
      professional: { select: { fullName: true } },
    },
  });
}

/** What the member paid for this booking: the captured payment's amount, else (older bookings) fee + GST. */
async function amountPaid(b: BookingForChange): Promise<number> {
  if (b.paymentId) {
    const p = await prisma.payment.findUnique({ where: { id: b.paymentId }, select: { amountCents: true, status: true } });
    if (p && p.status === "paid") return p.amountCents;
  }
  return b.priceCents + b.gstCents;
}

/** Cancels the booking and gives the member their credit. Shared by cancel and decline. */
async function cancelWithCredit(b: BookingForChange, by: "member", reason: "member_cancelled" | "reschedule_declined", now: Date) {
  // Claim the cancellation atomically, so two taps can't make two credits.
  const claimed = await prisma.booking.updateMany({
    where: { id: b.id, status: "confirmed" },
    data: {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: by,
      cancelReason: reason,
      proposedScheduledAt: null,
      proposedAt: null,
    },
  });
  if (claimed.count === 0) throw new ApiHttpError(409, "booking_not_confirmed", "This session is already cancelled");

  const amountCents = await amountPaid(b);
  const credit =
    amountCents > 0
      ? await prisma.sessionCredit.create({
          data: { userId: b.userId, amountCents, reason, sourceBookingId: b.id, expiresAt: new Date(now.getTime() + CREDIT_VALIDITY_DAYS * DAY_MS) },
        })
      : null;

  await recordAudit({
    actorId: b.userId,
    action: reason === "member_cancelled" ? "booking.cancelled_by_member" : "booking.reschedule_declined",
    entityType: "Booking",
    entityId: b.id,
    stateBefore: { status: "confirmed" },
    stateAfter: { status: "cancelled" },
    metadata: { creditId: credit?.id ?? null, creditCents: credit?.amountCents ?? 0, scheduledAt: b.scheduledAt.toISOString() },
  });
  return credit;
}

const creditView = (c: { id: string; amountCents: number; reason: string; expiresAt: Date; createdAt: Date }) => ({
  id: c.id,
  amountCents: c.amountCents,
  reason: c.reason,
  expiresAt: c.expiresAt.toISOString(),
  createdAt: c.createdAt.toISOString(),
});

/** The member cancels their own confirmed session, any time before it starts. */
export async function cancelBookingAsMember(userId: string, bookingId: string, now: Date = new Date()) {
  const b = await loadBooking(bookingId);
  if (!b || b.userId !== userId) throw new ApiHttpError(404, "booking_not_found", "Session not found");
  if (b.status !== "confirmed") throw new ApiHttpError(409, "booking_not_confirmed", "This session is already cancelled");
  if (b.scheduledAt.getTime() <= now.getTime()) {
    throw new ApiHttpError(409, "booking_started", "This session has already started, so it can't be cancelled");
  }
  const credit = await cancelWithCredit(b, "member", "member_cancelled", now);
  await notifyProfessional(b.professionalId, {
    kind: "booking",
    title: `${b.user.fullName} cancelled a session`,
    body: `Your session on ${when(b.scheduledAt)} is cancelled. The slot is free again.`,
    link: "/calendar",
  });
  return { bookingId: b.id, status: "cancelled" as const, credit: credit ? creditView(credit) : null };
}

/** The coach proposes a new time for a confirmed session (at least 12 hours before it). */
export async function proposeNewTime(professionalId: string, bookingId: string, input: { scheduledAt: string }, now: Date = new Date()) {
  const b = await loadBooking(bookingId);
  if (!b || b.professionalId !== professionalId) throw new ApiHttpError(404, "booking_not_found", "Session not found");
  if (b.status !== "confirmed") throw new ApiHttpError(409, "booking_not_confirmed", "Only a booked session can be moved");
  if (b.scheduledAt.getTime() - now.getTime() < COACH_PROPOSAL_MIN_NOTICE_MS) {
    throw new ApiHttpError(409, "proposal_too_late", "A new time can be proposed up to 12 hours before the session");
  }
  const next = new Date(input.scheduledAt);
  if (Number.isNaN(next.getTime()) || !isOnSlotGrid(next)) throw new ApiHttpError(400, "invalid_slot", "Pick one of the offered times");
  if (next.getTime() <= now.getTime()) throw new ApiHttpError(400, "invalid_slot", "Pick a time in the future");
  if (next.getTime() === b.scheduledAt.getTime()) throw new ApiHttpError(400, "same_slot", "That's already the session's time");
  if (!(await slotIsFree(b.professionalId, next, b.durationMinutes, b.id))) {
    throw new ApiHttpError(409, "slot_unavailable", "You already have a session at that time");
  }

  await prisma.booking.update({ where: { id: b.id }, data: { proposedScheduledAt: next, proposedAt: now } });
  await recordAudit({
    actorProfessionalId: professionalId,
    action: "booking.new_time_proposed",
    entityType: "Booking",
    entityId: b.id,
    metadata: { from: b.scheduledAt.toISOString(), to: next.toISOString() },
  });
  await createNotification(b.userId, {
    kind: "coach",
    title: `${b.professional.fullName} asked to move your session`,
    body: `From ${when(b.scheduledAt)} to ${when(next)}. Accept the new time, or decline and get a session credit.`,
    deepLink: sessionLink(b.id),
  });
  return { bookingId: b.id, scheduledAt: b.scheduledAt.toISOString(), proposedScheduledAt: next.toISOString() };
}

/** The coach takes back an unanswered proposal. */
export async function withdrawProposal(professionalId: string, bookingId: string) {
  const b = await loadBooking(bookingId);
  if (!b || b.professionalId !== professionalId) throw new ApiHttpError(404, "booking_not_found", "Session not found");
  if (!b.proposedScheduledAt) throw new ApiHttpError(409, "no_proposal", "There's no new time waiting for an answer");
  await prisma.booking.update({ where: { id: b.id }, data: { proposedScheduledAt: null, proposedAt: null } });
  await recordAudit({ actorProfessionalId: professionalId, action: "booking.proposal_withdrawn", entityType: "Booking", entityId: b.id });
  return { bookingId: b.id };
}

async function openProposalFor(userId: string, bookingId: string, now: Date) {
  const b = await loadBooking(bookingId);
  if (!b || b.userId !== userId) throw new ApiHttpError(404, "booking_not_found", "Session not found");
  if (b.status !== "confirmed" || !b.proposedScheduledAt) {
    throw new ApiHttpError(409, "no_proposal", "There's no new time waiting for your answer");
  }
  if (b.scheduledAt.getTime() <= now.getTime()) {
    throw new ApiHttpError(409, "proposal_lapsed", "This session has already started, so the new time no longer applies");
  }
  return b as BookingForChange & { proposedScheduledAt: Date };
}

/** The member accepts the coach's new time: the session moves. */
export async function acceptProposal(userId: string, bookingId: string, now: Date = new Date()) {
  const b = await openProposalFor(userId, bookingId, now);
  const next = b.proposedScheduledAt;
  if (next.getTime() <= now.getTime()) throw new ApiHttpError(409, "proposal_lapsed", "The proposed time has passed");
  if (!(await slotIsFree(b.professionalId, next, b.durationMinutes, b.id))) {
    throw new ApiHttpError(409, "slot_unavailable", "That time is no longer free. Ask your coach for another one");
  }
  const updated = await prisma.booking.update({
    where: { id: b.id },
    data: { scheduledAt: next, proposedScheduledAt: null, proposedAt: null },
    select: { id: true, scheduledAt: true },
  });
  await recordAudit({
    actorId: userId,
    action: "booking.reschedule_accepted",
    entityType: "Booking",
    entityId: b.id,
    metadata: { from: b.scheduledAt.toISOString(), to: next.toISOString() },
  });
  await notifyProfessional(b.professionalId, {
    kind: "booking",
    title: `${b.user.fullName} accepted the new time`,
    body: `The session is now on ${when(next)}.`,
    link: `/clients/${b.userId}`,
  });
  return { bookingId: updated.id, scheduledAt: updated.scheduledAt.toISOString() };
}

/** The member declines the coach's new time: the session is cancelled and they get a credit. */
export async function declineProposal(userId: string, bookingId: string, now: Date = new Date()) {
  const b = await openProposalFor(userId, bookingId, now);
  const credit = await cancelWithCredit(b, "member", "reschedule_declined", now);
  await notifyProfessional(b.professionalId, {
    kind: "booking",
    title: `${b.user.fullName} couldn't make the new time`,
    body: `The session on ${when(b.scheduledAt)} is cancelled and ${b.user.fullName} got a session credit.`,
    link: "/calendar",
  });
  return { bookingId: b.id, status: "cancelled" as const, credit: credit ? creditView(credit) : null };
}

/** The member's credits that can still be spent, soonest-expiring first. */
export async function listMyCredits(userId: string, now: Date = new Date()) {
  const rows = await prisma.sessionCredit.findMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
  });
  return { items: rows.map(creditView) };
}

/**
 * Books a session with a credit instead of Razorpay. The credit must belong
 * to the member, be unspent and unexpired, and cover the session's full price
 * (fee + GST). It's claimed atomically first and released if the booking
 * can't be made (slot taken, coach hasn't accepted, …).
 */
export async function bookWithCredit(
  userId: string,
  input: { professionalId: string; offeringId: string; scheduledAt: string; creditId: string },
  now: Date = new Date(),
) {
  const credit = await prisma.sessionCredit.findUnique({ where: { id: input.creditId } });
  if (!credit || credit.userId !== userId) throw new ApiHttpError(404, "credit_not_found", "Session credit not found");
  if (credit.usedAt) throw new ApiHttpError(409, "credit_used", "This credit has already been used");
  if (credit.expiresAt.getTime() <= now.getTime()) throw new ApiHttpError(409, "credit_expired", "This credit has expired");

  const offering = await prisma.professionalServiceOffering.findUnique({
    where: { id: input.offeringId },
    select: { id: true, serviceId: true, professionalId: true },
  });
  if (!offering || offering.professionalId !== input.professionalId) {
    throw new ApiHttpError(404, "offering_not_found", "This coaching service could not be found");
  }
  const price = await priceOffering({ id: offering.id, serviceId: offering.serviceId, professionalId: offering.professionalId });
  const total = price.feeCents + price.gstCents;
  if (credit.amountCents < total) {
    throw new ApiHttpError(409, "credit_too_small", `This credit (${rupees(credit.amountCents)}) doesn't cover this session (${rupees(total)})`);
  }

  const claimed = await prisma.sessionCredit.updateMany({ where: { id: credit.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count === 0) throw new ApiHttpError(409, "credit_used", "This credit has already been used");

  try {
    const booking = await createBooking(
      userId,
      { professionalId: input.professionalId, offeringId: input.offeringId, scheduledAt: input.scheduledAt },
      { verifiedPayment: true, paidPrice: { feeCents: price.feeCents, gstCents: price.gstCents, coachLevelId: price.coachLevelId }, paidWithCreditId: credit.id },
    );
    await recordAudit({
      actorId: userId,
      action: "session_credit.spent",
      entityType: "SessionCredit",
      entityId: credit.id,
      metadata: { bookingId: (booking as { id: string }).id, creditCents: credit.amountCents, priceCents: total },
    });
    return booking;
  } catch (err) {
    await prisma.sessionCredit.update({ where: { id: credit.id }, data: { usedAt: null } });
    throw err;
  }
}
