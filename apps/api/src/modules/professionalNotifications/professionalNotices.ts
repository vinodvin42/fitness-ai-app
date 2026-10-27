import { prisma } from "../../db/prisma";
import { notifyProfessional } from "./professionalNotifications.service";

/**
 * Inbox rows that tell a coach what happened (26 Oct 2026, coach app gap
 * "notifications both ways"; the member side is coaching/memberNotices.ts).
 * Called by the module where each event happens. All best-effort: a lookup
 * that fails or finds nothing just skips the notice, and notifyProfessional
 * swallows its own errors, so none of these can fail the action itself.
 *
 * Email goes only with time-critical or money notices (a request or offer
 * that expires, a verification decision, a payout); bookings, messages and
 * relationship changes are inbox-only.
 */

const SERVICE: Record<string, string> = { fitness: "fitness", nutrition: "nutrition" };
const service = (s: string) => SERVICE[s] ?? s;

const dateTime = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** A member asked this coach to coach them. */
export async function notifyCoachOfRequest(relationshipId: string): Promise<void> {
  const r = await prisma.relationship
    .findUnique({ where: { id: relationshipId }, select: { professionalId: true, serviceType: true, user: { select: { fullName: true } } } })
    .catch(() => null);
  if (!r) return;
  await notifyProfessional(r.professionalId, {
    kind: "request",
    title: `New coaching request from ${r.user.fullName}`,
    body: `${r.user.fullName} asked you for ${service(r.serviceType)} coaching. Accept or decline before the request expires.`,
    link: "/clients/requests",
    email: true,
  });
}

/** Fynrox (or a handing-over coach) proposed this coach for a member. */
export async function notifyCoachOfOffer(offerId: string): Promise<void> {
  const o = await prisma.professionalOffer
    .findUnique({ where: { id: offerId }, select: { professionalId: true, serviceType: true, expiresAt: true, user: { select: { fullName: true } } } })
    .catch(() => null);
  if (!o) return;
  const by = o.expiresAt ? ` Reply by ${dateTime(o.expiresAt)}.` : "";
  await notifyProfessional(o.professionalId, {
    kind: "offer",
    title: `Fynrox proposed you as ${o.user.fullName}'s coach`,
    body: `You've been offered ${o.user.fullName} as a ${service(o.serviceType)} client.${by}`,
    link: "/clients/offers",
    email: true,
  });
}

/** A member booked (and paid for) a session with this coach. */
export async function notifyCoachOfBooking(bookingId: string): Promise<void> {
  const b = await prisma.booking
    .findUnique({ where: { id: bookingId }, select: { professionalId: true, userId: true, scheduledAt: true, durationMinutes: true, user: { select: { fullName: true } } } })
    .catch(() => null);
  if (!b) return;
  await notifyProfessional(b.professionalId, {
    kind: "booking",
    title: `${b.user.fullName} booked a session`,
    body: `${dateTime(b.scheduledAt)}, ${b.durationMinutes} min.`,
    link: `/clients/${b.userId}`,
  });
}

/** How long one conversation's message notice stands for the messages after it. */
const MESSAGE_NOTICE_WINDOW_MS = 30 * 60 * 1000;

/**
 * A member wrote to this coach. One notice per conversation while it's
 * unread and recent, so a burst of messages is one row, not ten.
 */
export async function notifyCoachOfMessage(userId: string, professionalId: string, content: string): Promise<void> {
  const link = `/messages/${userId}`;
  const recent = await prisma.professionalNotification
    .findFirst({
      where: { professionalId, kind: "message", link, readAt: null, createdAt: { gt: new Date(Date.now() - MESSAGE_NOTICE_WINDOW_MS) } },
      select: { id: true },
    })
    .catch(() => null);
  if (recent) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }).catch(() => null);
  if (!user) return;
  await notifyProfessional(professionalId, {
    kind: "message",
    title: `New message from ${user.fullName}`,
    body: content.slice(0, 140),
    link,
  });
}

/** Fynrox ended a coaching relationship (the coach ending it themself needs no notice). */
export async function notifyCoachOfEndByFynrox(relationshipId: string, reason: string): Promise<void> {
  const r = await prisma.relationship
    .findUnique({ where: { id: relationshipId }, select: { professionalId: true, serviceType: true, userId: true, user: { select: { fullName: true } } } })
    .catch(() => null);
  if (!r) return;
  await notifyProfessional(r.professionalId, {
    kind: "relationship",
    title: `Coaching with ${r.user.fullName} was ended by Fynrox`,
    body: `Your ${service(r.serviceType)} coaching with ${r.user.fullName} has ended. Reason: ${reason}`,
    link: `/clients/${r.userId}`,
  });
}

/** An admin verified or rejected one of this coach's credentials. */
export async function notifyCoachOfCredentialDecision(credentialId: string): Promise<void> {
  const c = await prisma.professionalCredential
    .findUnique({ where: { id: credentialId }, select: { professionalId: true, serviceType: true, status: true, adminNotes: true } })
    .catch(() => null);
  if (!c || (c.status !== "verified" && c.status !== "rejected")) return;
  const verified = c.status === "verified";
  await notifyProfessional(c.professionalId, {
    kind: "verification",
    title: verified ? `Your ${service(c.serviceType)} credential is verified` : `Your ${service(c.serviceType)} credential wasn't accepted`,
    body: verified
      ? `Fynrox verified your ${service(c.serviceType)} credential. Once your identity is verified too, you can take ${service(c.serviceType)} clients.`
      : `Fynrox couldn't accept your ${service(c.serviceType)} credential.${c.adminNotes ? ` Reason: ${c.adminNotes}` : ""} You can upload it again from Verification.`,
    link: "/verification",
    email: true,
  });
}

/** An admin verified or rejected this coach's identity (KYC). */
export async function notifyCoachOfKycDecision(professionalId: string): Promise<void> {
  const p = await prisma.professional
    .findUnique({ where: { id: professionalId }, select: { kycStatus: true, adminNotes: true } })
    .catch(() => null);
  if (!p || (p.kycStatus !== "verified" && p.kycStatus !== "rejected")) return;
  const verified = p.kycStatus === "verified";
  await notifyProfessional(professionalId, {
    kind: "verification",
    title: verified ? "Your identity is verified" : "Your identity document wasn't accepted",
    body: verified
      ? "Fynrox verified your identity. Any service with a verified credential is now open to clients."
      : `Fynrox couldn't accept your identity document.${p.adminNotes ? ` Reason: ${p.adminNotes}` : ""} You can upload it again from Verification.`,
    link: "/verification",
    email: true,
  });
}

/** A payout run paid these settlements, or failed to. */
export async function notifyCoachesOfPayout(settlementIds: string[], outcome: "paid" | "failed"): Promise<void> {
  if (settlementIds.length === 0) return;
  const rows = await prisma.coachSettlement
    .findMany({ where: { id: { in: settlementIds } }, select: { professionalId: true, netCents: true, periodStart: true } })
    .catch(() => []);
  for (const s of rows) {
    const month = s.periodStart.toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
    const amount = `₹${(s.netCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    await notifyProfessional(s.professionalId, {
      kind: "payout",
      title: outcome === "paid" ? `${amount} paid for ${month}` : `Your ${month} payout didn't go through`,
      body:
        outcome === "paid"
          ? `Fynrox paid your ${month} earnings of ${amount}. It can take a working day to show in your bank.`
          : `We couldn't pay your ${month} earnings of ${amount}. If your bank details have changed, update your payout details on the Earnings page and we'll retry once Fynrox has verified them.`,
      link: "/earnings",
      email: true,
    });
  }
}
