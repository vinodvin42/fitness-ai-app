import { prisma } from "../../db/prisma";
import { PAYMENT_WINDOW_MS } from "../../lib/relationshipActivation";
import { createNotification } from "../notifications/notifications.service";

/**
 * Inbox rows that tell the member what their coach did (coach app audit,
 * 26 Oct 2026). Before these, the member only found out by opening the
 * request screen, so an accepted request's payment window often ran out
 * unseen. Each one is best-effort: `createNotification` already swallows its
 * own errors, and a missing row here never fails the coach's action.
 *
 * Deep links: `coach-request?relationshipId=` opens that request's status
 * screen (where the member pays); `coaching` opens Conversations.
 */

async function loadRelationship(relationshipId: string) {
  return prisma.relationship
    .findUnique({
      where: { id: relationshipId },
      select: { id: true, userId: true, serviceType: true, professional: { select: { fullName: true } } },
    })
    .catch(() => null);
}

const coachName = (row: { professional: { fullName: string } | null }) => row.professional?.fullName ?? "Your coach";
const requestLink = (id: string) => `coach-request?relationshipId=${encodeURIComponent(id)}`;

/** The coach accepted a direct request or a Fynrox match: the member now has to pay to start. */
export async function notifyMemberOfAcceptance(relationshipId: string): Promise<void> {
  const row = await loadRelationship(relationshipId);
  if (!row) return;
  const hours = Math.round(PAYMENT_WINDOW_MS / (60 * 60 * 1000));
  await createNotification(row.userId, {
    kind: "coach",
    title: `${coachName(row)} accepted your request`,
    body: `${coachName(row)} can coach you for ${row.serviceType}. Complete payment within ${hours} hours to start, or the request will close.`,
    deepLink: requestLink(row.id),
  });
}

/** The coach declined a direct request. */
export async function notifyMemberOfDecline(relationshipId: string): Promise<void> {
  const row = await loadRelationship(relationshipId);
  if (!row) return;
  await createNotification(row.userId, {
    kind: "coach",
    title: "Your coaching request was declined",
    body: `${coachName(row)} can't take your ${row.serviceType} coaching request right now. You can ask another coach, or let Fynrox match you with one.`,
    deepLink: requestLink(row.id),
  });
}

/** The coach published a session summary the member can read. */
export async function notifyMemberOfSummary(userId: string, professionalName: string | null): Promise<void> {
  const coach = professionalName ?? "Your coach";
  await createNotification(userId, {
    kind: "coach",
    title: "Your session summary is ready",
    body: `${coach} wrote a summary of your session. Open My coaches to read it.`,
    deepLink: "coaching",
  });
}

/** Coaching finished as planned (Complete, not End). */
export async function notifyMemberOfCompletion(relationshipId: string): Promise<void> {
  const row = await loadRelationship(relationshipId);
  if (!row) return;
  await createNotification(row.userId, {
    kind: "coach",
    title: "Your coaching is complete",
    body: `${coachName(row)} marked your ${row.serviceType} coaching as complete. Well done. You can ask for a new coach whenever you're ready.`,
  });
}

/**
 * A request closed on its own (27 Oct 2026): the coach didn't reply in time
 * (`no_reply`), or the member didn't pay in time after the coach accepted
 * (`not_paid`). Nothing is ever charged on either path.
 */
export async function notifyMemberOfRequestExpired(relationshipId: string, cause: "no_reply" | "not_paid"): Promise<void> {
  const row = await loadRelationship(relationshipId);
  if (!row) return;
  await createNotification(row.userId, {
    kind: "coach",
    title: cause === "no_reply" ? "Your coaching request expired" : "Your coaching request closed",
    body:
      cause === "no_reply"
        ? `${coachName(row)} didn't reply in time, so your ${row.serviceType} coaching request closed. Nothing was charged. You can ask another coach, or let Fynrox match you with one.`
        : `The time to pay for ${row.serviceType} coaching with ${coachName(row)} has passed, so the request closed. Nothing was charged. Send a new request whenever you're ready.`,
    deepLink: requestLink(row.id),
  });
}

/** Fynrox reviewed the member's change request and kept the coach (27 Oct 2026). The admin's notes stay internal. */
export async function notifyMemberOfChangeRequestDenied(relationshipId: string): Promise<void> {
  const row = await loadRelationship(relationshipId);
  if (!row) return;
  // Only while the coaching still runs: "stays as it is" would be wrong for one that ended another way.
  const active = await prisma.relationship.count({ where: { id: relationshipId, status: "active" } }).catch(() => 0);
  if (!active) return;
  await createNotification(row.userId, {
    kind: "coach",
    title: "Your request to change coach was reviewed",
    body: `Fynrox reviewed your request and your ${row.serviceType} coaching with ${coachName(row)} stays as it is. If you'd like to talk it through, contact support.`,
    deepLink: "coaching",
  });
}
