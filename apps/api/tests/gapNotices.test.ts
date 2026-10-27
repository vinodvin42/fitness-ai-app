import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { REQUEST_REPLY_WINDOW_MS, PAYMENT_WINDOW_MS } from "../src/lib/relationshipActivation";
import { cancelGuidanceRequest, expireOverdueRequests, rescheduleBooking } from "../src/modules/coaching/coaching.service";
import { completeRelationship } from "../src/modules/relationshipLifecycle/relationshipLifecycle.service";
import { createSubmission } from "../src/modules/formAnalysis/formAnalysis.service";
import { rateSession } from "../src/modules/coachSummaries/coachSummaries.service";
import { reactivateProfessional, suspendProfessional } from "../src/modules/adminProfessionals/adminProfessionals.service";
import { resolveSafetyReport } from "../src/modules/adminSafetyReports/adminSafetyReports.service";
import { reportPartner, sendMessage, REMOVED_MESSAGE_TEXT } from "../src/modules/coachMessages/coachMessages.service";
import { proposeNewTime, withdrawProposal } from "../src/modules/bookingChanges/bookingChanges.service";
import { denyChangeRequest } from "../src/modules/adminRelationships/adminRelationships.service";
import { returnToQueue } from "../src/modules/guidanceRequests/guidanceRequests.service";
import { r1Flags } from "@fitness-ai-app/config";

/**
 * Gap fixes, 27 Oct 2026: events that reached the coach's inbox or the
 * member's notifications nowhere. Each test drives the real service
 * function and checks the notice it wrote. Service calls only (no HTTP),
 * so no rate limits are touched.
 */
describe("Gap notices: coach and member hear about these events", () => {
  let coachId: string;
  let otherCoachId: string;
  let userId: string;
  let adminId: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  const DAY = 24 * 60 * 60 * 1000;
  const slot = (daysAhead: number, hourUtc: number) => {
    const d = new Date(Date.now() + daysAhead * DAY);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d;
  };
  const coachInbox = (id: string) => prisma.professionalNotification.findMany({ where: { professionalId: id }, orderBy: { createdAt: "asc" } });
  const memberInbox = () => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const book = (scheduledAt: Date) =>
    prisma.booking.create({
      data: { userId, professionalId: coachId, offeringId, scheduledAt, durationMinutes: 60, priceCents: 100000, gstCents: 18000, commissionPct: 20, status: "confirmed" },
    });
  const clearInboxes = async () => {
    await prisma.professionalNotification.deleteMany({ where: { professionalId: { in: [coachId, otherCoachId] } } });
    await prisma.notification.deleteMany({ where: { userId } });
  };

  beforeAll(async () => {
    const makeCoach = async (tag: string) =>
      prisma.professional.create({
        data: {
          email: `gapn-${tag}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Gap ${tag} Coach`,
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      });
    coachId = (await makeCoach("main")).id;
    otherCoachId = (await makeCoach("other")).id;
    userId = (
      await prisma.user.create({
        data: {
          email: uniqueEmail("gapn-member"),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Gap Member",
          referralCode: await generateUniqueReferralCode(),
        },
      })
    ).id;
    adminId = (
      await prisma.adminUser.create({
        data: {
          email: uniqueEmail("gapn-admin"),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Gap Admin",
          role: "super_admin",
          status: "active",
        } as never,
      })
    ).id;
    pricing = await createPricedOffering(coachId, { serviceType: "fitness", feeCents: 100000, durationMinutes: 60, label: "Gap Session" });
    offeringId = pricing.offering.id;
  });

  afterAll(async () => {
    await clearInboxes();
    await prisma.adminActionItem.deleteMany({ where: { metadata: { path: ["userId"], equals: userId } } });
    await prisma.safetyReport.deleteMany({ where: { OR: [{ reporterProfessionalId: coachId }, { reportedUserId: userId }] } });
    await prisma.coachMessage.deleteMany({ where: { userId } });
    await prisma.formAnalysisSubmission.deleteMany({ where: { userId } });
    await prisma.sessionRating.deleteMany({ where: { userId } });
    await prisma.relationshipChangeRequest.deleteMany({ where: { userId } });
    await prisma.guidanceRequest.deleteMany({ where: { userId } });
    await prisma.booking.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: userId }, { actorAdminId: adminId }, { actorProfessionalId: { in: [coachId, otherCoachId] } }] } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId: coachId } });
    await pricing?.cleanup();
    await prisma.professionalRefreshToken.deleteMany({ where: { professionalId: { in: [coachId, otherCoachId] } } });
    await prisma.professional.deleteMany({ where: { id: { in: [coachId, otherCoachId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  it("1a: a member moving a session tells the coach, linking to the calendar", async () => {
    await clearInboxes();
    const from = slot(4, 10);
    const b = await book(from);
    await rescheduleBooking(userId, b.id, { scheduledAt: slot(4, 12).toISOString() });
    const [row] = await coachInbox(coachId);
    expect(row).toMatchObject({ kind: "booking", title: "Gap Member moved a session", link: "/calendar" });
    expect(row.body).toMatch(/^From .+ to .+\.$/);
    await prisma.booking.delete({ where: { id: b.id } });
  });

  it("1b: a member cancelling a request tells the coach", async () => {
    await clearInboxes();
    const rel = await prisma.relationship.create({
      data: { userId, professionalId: coachId, serviceType: "nutrition", status: "requested", requestedAt: new Date() },
    });
    await cancelGuidanceRequest(userId, rel.id);
    const [row] = await coachInbox(coachId);
    expect(row).toMatchObject({ kind: "request", title: "Gap Member cancelled their coaching request", link: "/clients/requests" });
    expect(row.body).toContain("Nothing was charged");
    await prisma.relationship.delete({ where: { id: rel.id } });
  });

  it("1c: an expired request tells both sides once; a lapsed payment window too", async () => {
    await clearInboxes();
    const unanswered = await prisma.relationship.create({
      data: { userId, professionalId: coachId, serviceType: "fitness", status: "requested", requestedAt: new Date(Date.now() - REQUEST_REPLY_WINDOW_MS - 60_000) },
    });
    expect(await expireOverdueRequests({ id: unanswered.id })).toBe(1);
    // A second pass finds nothing to move and sends nothing more.
    expect(await expireOverdueRequests({ id: unanswered.id })).toBe(0);
    expect((await prisma.relationship.findUnique({ where: { id: unanswered.id } }))?.status).toBe("expired");

    const unpaid = await prisma.relationship.create({
      data: {
        userId,
        professionalId: coachId,
        serviceType: "nutrition",
        status: "accepted",
        requestedAt: new Date(Date.now() - PAYMENT_WINDOW_MS - 2 * 60_000),
        acceptedAt: new Date(Date.now() - PAYMENT_WINDOW_MS - 60_000),
      },
    });
    expect(await expireOverdueRequests({ id: unpaid.id })).toBe(1);

    const coach = await coachInbox(coachId);
    expect(coach.map((r) => r.title)).toEqual(["Gap Member's coaching request expired", "Gap Member's request closed without payment"]);
    expect(coach.every((r) => r.kind === "request" && r.link === "/clients/requests")).toBe(true);

    const member = await memberInbox();
    expect(member).toHaveLength(2);
    expect(member[0]).toMatchObject({ kind: "coach", title: "Your coaching request expired", deepLink: `coach-request?relationshipId=${unanswered.id}` });
    expect(member[1]).toMatchObject({ kind: "coach", title: "Your coaching request closed", deepLink: `coach-request?relationshipId=${unpaid.id}` });
    expect(member.every((n) => n.body.includes("Nothing was charged"))).toBe(true);
    await prisma.relationship.deleteMany({ where: { id: { in: [unanswered.id, unpaid.id] } } });
  });

  it("1d: Fynrox completing a relationship tells the coach; the coach completing it does not", async () => {
    await clearInboxes();
    const byAdmin = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType: "fitness", status: "active" } });
    await completeRelationship({ adminId }, byAdmin.id, "Programme finished as agreed");
    const rows = await coachInbox(coachId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "relationship", title: "Coaching with Gap Member was marked complete by Fynrox", link: `/clients/${userId}` });

    await clearInboxes();
    const byCoach = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType: "nutrition", status: "active" } });
    await completeRelationship({ professionalId: coachId }, byCoach.id, "Programme finished as agreed");
    expect(await coachInbox(coachId)).toHaveLength(0);
    await prisma.relationship.deleteMany({ where: { id: { in: [byAdmin.id, byCoach.id] } } });
  });

  it("1e: a form clip tells every coach with an active relationship, linking to the review", async () => {
    await clearInboxes();
    const rels = await prisma.relationship.createManyAndReturn({
      data: [
        { userId, professionalId: coachId, serviceType: "fitness", status: "active" },
        { userId, professionalId: otherCoachId, serviceType: "nutrition", status: "active" },
      ],
    });
    const sub = await createSubmission(userId, { videoUrl: "https://example.com/clip.mp4" } as never);
    for (const id of [coachId, otherCoachId]) {
      const [row] = await coachInbox(id);
      expect(row).toMatchObject({ title: "Gap Member sent a form clip", link: `/form-reviews/${sub.id}` });
    }
    await prisma.relationship.deleteMany({ where: { id: { in: rels.map((r) => r.id) } } });
  });

  it("1f: a rating tells the coach, stars in the body not the title", async () => {
    await clearInboxes();
    const b = await book(new Date(Date.now() - 2 * 60 * 60 * 1000));
    await rateSession(userId, b.id, { stars: 4, tags: [] });
    await rateSession(userId, b.id, { stars: 5, tags: [] });
    const rows = await coachInbox(coachId);
    expect(rows.map((r) => r.title)).toEqual(["Gap Member rated a session", "Gap Member updated their session rating"]);
    expect(rows[0].body).toMatch(/^4 out of 5 for your session on /);
    expect(rows[1].body).toMatch(/^5 out of 5 /);
    expect(rows.every((r) => r.link === `/clients/${userId}` && !/\d/.test(r.title))).toBe(true);
  });

  it("1g: suspending and reactivating tell the coach in generic words, never the admin's note", async () => {
    await clearInboxes();
    await suspendProfessional(adminId, otherCoachId, { adminNotes: "Internal: three complaints this week" } as never);
    // Suspending an already-suspended coach writes nothing new.
    await suspendProfessional(adminId, otherCoachId, { adminNotes: "again" } as never);
    await reactivateProfessional(adminId, otherCoachId);
    const rows = await coachInbox(otherCoachId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "system",
      title: "Your Fynrox Coach account has been suspended",
      body: "Your Fynrox Coach account has been suspended. Contact support@fynrox.com.",
    });
    expect(rows[1].title).toBe("Your Fynrox Coach account is active again");
    expect(rows.some((r) => r.body.includes("complaints"))).toBe(false);
  });

  it("1h + 3: removing a member's message scrubs the coach's inbox copy, and the reporting coach is thanked", async () => {
    await clearInboxes();
    const rel = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType: "fitness", status: "active" } });
    const msg = await sendMessage(userId, coachId, "user", { content: "Something abusive the coach reported" });
    const copy = (await coachInbox(coachId)).find((r) => r.kind === "message");
    expect(copy?.body).toBe("Something abusive the coach reported");

    const report = await reportPartner(userId, coachId, "professional", { reason: "harassment", messageId: (msg as { id: string }).id } as never);
    await resolveSafetyReport(adminId, report.id, { outcome: "message_removed", reason: "Abusive message removed after review" } as never);

    const rows = await coachInbox(coachId);
    expect(rows.find((r) => r.id === copy!.id)?.body).toBe(REMOVED_MESSAGE_TEXT);
    const thanks = rows.filter((r) => r.title === "Thanks for your report");
    expect(thanks).toHaveLength(1);
    expect(thanks[0].body).not.toMatch(/removed|suspend|warn/i);
    await prisma.relationship.delete({ where: { id: rel.id } }).catch(() => undefined);
  });

  it("2a: a coach withdrawing a proposed time tells the member the session stays put", async () => {
    await clearInboxes();
    const b = await book(slot(5, 11));
    await proposeNewTime(coachId, b.id, { scheduledAt: slot(5, 14).toISOString() });
    await withdrawProposal(coachId, b.id);
    const last = (await memberInbox()).at(-1);
    expect(last).toMatchObject({ kind: "coach", title: "Gap main Coach kept your session time", deepLink: `coach-session?bookingId=${b.id}` });
    expect(last?.body).toContain("kept your session at");
    await prisma.booking.delete({ where: { id: b.id } });
  });

  it("2b: an admin denying a change request tells the member, without the review notes", async () => {
    await clearInboxes();
    const rel = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType: "fitness", status: "active" } });
    const cr = await prisma.relationshipChangeRequest.create({ data: { relationshipId: rel.id, userId, reason: "other", status: "pending" } });
    await denyChangeRequest(adminId, cr.id, { reviewNotes: "Internal: coach is fine, member is shopping around" } as never);
    const [row] = await memberInbox();
    expect(row).toMatchObject({ kind: "coach", title: "Your request to change coach was reviewed", deepLink: "coaching" });
    expect(row.body).not.toContain("shopping");
    await prisma.relationship.delete({ where: { id: rel.id } });
  });

  it("2c: a guidance request that runs out of matches tells the member", async () => {
    await clearInboxes();
    const req = await prisma.guidanceRequest.create({ data: { userId, serviceType: "nutrition", status: "offered" } as never });
    for (let i = 0; i < r1Flags.MAX_REMATCH_ATTEMPTS; i++) {
      await prisma.guidanceRequest.update({ where: { id: req.id }, data: { status: "offered" } });
      await returnToQueue(req.id, "declined");
    }
    const rows = (await memberInbox()).filter((n) => n.title === "We couldn't find you a coach this time");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "coach", deepLink: "coaching" });
  });
});
