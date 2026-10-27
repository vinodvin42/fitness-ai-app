import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { createActionItem } from "../src/lib/adminActionQueue";
import { createBooking, createChangeRequest } from "../src/modules/coaching/coaching.service";
import { approveChangeRequest, denyChangeRequest, reactivateRelationship } from "../src/modules/adminRelationships/adminRelationships.service";
import { cancelMyGuidanceRequest, markFulfilled, markOffered, returnToQueue } from "../src/modules/guidanceRequests/guidanceRequests.service";
import { acceptOffer, declineOffer } from "../src/modules/professionalOffers/professionalOffers.service";
import { reviewSafetyEscalation } from "../src/modules/adminSafety/adminSafety.service";
import { getDashboardStats } from "../src/modules/professionalDashboard/professionalDashboard.service";
import { listMyRatings } from "../src/modules/coachSummaries/coachSummaries.service";

/**
 * Gap fixes, 27 Oct 2026: Action Required items that never closed once the
 * case behind them was dealt with, plus two small read fixes (the coach
 * dashboard's stale `notAvailable`, and a rating average that only covered
 * the latest 100). Service calls only, so no rate limits are touched.
 */
describe("Gap queue hygiene: items close when their case does", () => {
  let coachId: string;
  let userId: string;
  let adminId: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  const DAY = 24 * 60 * 60 * 1000;
  const items = (entityType: string, entityId: string) =>
    prisma.adminActionItem.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "asc" } });
  const openCount = (entityType: string, entityId: string) =>
    prisma.adminActionItem.count({ where: { entityType, entityId, status: "open" } });

  beforeAll(async () => {
    coachId = (
      await prisma.professional.create({
        data: {
          email: `gapq-coach-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Gap Queue Coach",
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: uniqueEmail("gapq-member"),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Gap Queue Member",
          referralCode: await generateUniqueReferralCode(),
        },
      })
    ).id;
    adminId = (
      await prisma.adminUser.create({
        data: {
          email: uniqueEmail("gapq-admin"),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Gap Queue Admin",
          role: "super_admin",
          status: "active",
        } as never,
      })
    ).id;
    pricing = await createPricedOffering(coachId, { serviceType: "fitness", feeCents: 100000, durationMinutes: 60, label: "Gap Queue Session" });
    offeringId = pricing.offering.id;
  });

  afterAll(async () => {
    await prisma.adminActionItem.deleteMany({
      where: { OR: [{ metadata: { path: ["userId"], equals: userId } }, { metadata: { path: ["professionalId"], equals: coachId } }] },
    });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.professionalNotification.deleteMany({ where: { professionalId: coachId } });
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.sessionRating.deleteMany({ where: { professionalId: coachId } });
    await prisma.relationshipChangeRequest.deleteMany({ where: { userId } });
    await prisma.guidanceRequest.deleteMany({ where: { userId } });
    await prisma.professionalOffer.deleteMany({ where: { professionalId: coachId } });
    await prisma.booking.deleteMany({ where: { professionalId: coachId } });
    await prisma.relationship.deleteMany({ where: { professionalId: coachId } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: userId }, { actorAdminId: adminId }, { actorProfessionalId: coachId }] } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId: coachId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: coachId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  it("closes a change request's item when an admin approves it, and when one denies it", async () => {
    const relA = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType: "fitness", status: "active" } });
    const a = await createChangeRequest(userId, relA.id, { reason: "schedule_conflict" } as never);
    expect(await openCount("RelationshipChangeRequest", a.id)).toBe(1);
    await approveChangeRequest(adminId, a.id, {} as never);
    const [approved] = await items("RelationshipChangeRequest", a.id);
    expect(approved).toMatchObject({ status: "resolved", resolvedByAdminId: adminId, resolutionNote: "Change request approved" });

    const relB = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType: "nutrition", status: "active" } });
    const b = await createChangeRequest(userId, relB.id, { reason: "other" } as never);
    await denyChangeRequest(adminId, b.id, {} as never);
    const [denied] = await items("RelationshipChangeRequest", b.id);
    expect(denied).toMatchObject({ status: "resolved", resolutionNote: "Change request denied" });
    await prisma.relationship.deleteMany({ where: { id: { in: [relA.id, relB.id] } } });
  });

  it("closes a guidance request's item when matched, queues it again when the offer comes back, closes it on fulfil or cancel", async () => {
    const queue = async (id: string) =>
      createActionItem({ type: "professional_assignment_pending", entityType: "GuidanceRequest", entityId: id, severity: "medium", metadata: { userId } });
    const offer = await prisma.professionalOffer.create({
      data: { professionalId: coachId, userId, serviceType: "fitness", status: "offered", proposedByAdminId: adminId },
    });

    const req = await prisma.guidanceRequest.create({ data: { userId, serviceType: "fitness" } as never });
    await queue(req.id);
    await markOffered(req.id, offer.id, adminId);
    expect(await openCount("GuidanceRequest", req.id)).toBe(0);
    await returnToQueue(req.id, "declined");
    expect(await openCount("GuidanceRequest", req.id)).toBe(1);
    // Back in the queue a second time without a match in between: still one open item.
    await prisma.guidanceRequest.update({ where: { id: req.id }, data: { status: "offered" } });
    await returnToQueue(req.id, "expired");
    expect(await openCount("GuidanceRequest", req.id)).toBe(1);
    await prisma.guidanceRequest.update({ where: { id: req.id }, data: { status: "offered" } });
    await markFulfilled(req.id, "relationship-id-not-needed-here");
    expect(await openCount("GuidanceRequest", req.id)).toBe(0);

    const cancelled = await prisma.guidanceRequest.create({ data: { userId, serviceType: "nutrition" } as never });
    await queue(cancelled.id);
    await cancelMyGuidanceRequest(userId, cancelled.id);
    const [row] = await items("GuidanceRequest", cancelled.id);
    expect(row).toMatchObject({ status: "resolved", resolutionNote: "Cancelled by the member" });
  });

  it("closes a stalled-offer item when the coach accepts or declines", async () => {
    const stalled = async (serviceType: "fitness" | "nutrition") => {
      const offer = await prisma.professionalOffer.create({
        data: { professionalId: coachId, userId, serviceType, status: "offered", proposedByAdminId: adminId, createdAt: new Date(Date.now() - 4 * DAY) },
      });
      await createActionItem({ type: "professional_acceptance_stalled", entityType: "ProfessionalOffer", entityId: offer.id, severity: "medium", metadata: { userId } });
      return offer;
    };
    const accepted = await stalled("fitness");
    await acceptOffer(coachId, accepted.id);
    expect(await openCount("ProfessionalOffer", accepted.id)).toBe(0);
    expect((await items("ProfessionalOffer", accepted.id))[0].resolutionNote).toBe("Offer accepted");

    const declined = await stalled("nutrition");
    await declineOffer(coachId, declined.id, "Full this month");
    expect((await items("ProfessionalOffer", declined.id))[0]).toMatchObject({ status: "resolved", resolutionNote: "Offer declined" });
    await prisma.relationship.deleteMany({ where: { professionalId: coachId } });
  });

  it("closes a safety escalation's item when an admin reviews it", async () => {
    const esc = await prisma.safetyEscalation.create({ data: { userId, medicalConditions: [], injuries: [] } });
    await createActionItem({ type: "safety_escalation", entityType: "SafetyEscalation", entityId: esc.id, severity: "high", metadata: { userId } });
    await reviewSafetyEscalation(adminId, esc.id);
    expect((await items("SafetyEscalation", esc.id))[0]).toMatchObject({ status: "resolved", resolvedByAdminId: adminId });
  });

  it("closes a stuck-activation item when an admin reactivates, or when the booking goes through", async () => {
    const stuck = async (serviceType: "fitness" | "nutrition") => {
      const rel = await prisma.relationship.create({ data: { userId, professionalId: coachId, serviceType, status: "activating" } });
      await createActionItem({ type: "relationship_activation_failed", entityType: "Relationship", entityId: rel.id, severity: "high", metadata: { professionalId: coachId } });
      return rel;
    };
    const byAdmin = await stuck("nutrition");
    await reactivateRelationship(adminId, byAdmin.id);
    expect((await items("Relationship", byAdmin.id))[0]).toMatchObject({ status: "resolved", resolvedByAdminId: adminId });
    await prisma.relationship.delete({ where: { id: byAdmin.id } });

    const byBooking = await stuck("fitness");
    const at = new Date(Date.now() + 6 * DAY);
    at.setUTCHours(10, 0, 0, 0);
    await createBooking(userId, { professionalId: coachId, offeringId, scheduledAt: at.toISOString() }, { verifiedPayment: true });
    expect((await prisma.relationship.findUnique({ where: { id: byBooking.id } }))?.status).toBe("active");
    expect((await items("Relationship", byBooking.id))[0]).toMatchObject({ status: "resolved", resolutionNote: "Coaching started: the booking went through" });
  });

  it("no longer lists avgRating as not available on the coach dashboard", async () => {
    const stats = await getDashboardStats(coachId);
    expect(stats.notAvailable).not.toContain("avgRating");
  });

  it("averages every rating, not only the latest 100 it lists", async () => {
    // 10 older one-star ratings, then 100 newer five-star ones.
    const base = Date.now() - 200 * DAY;
    const bookings = await prisma.booking.createManyAndReturn({
      data: Array.from({ length: 110 }, (_, i) => ({
        userId,
        professionalId: coachId,
        offeringId,
        scheduledAt: new Date(base + i * DAY),
        durationMinutes: 60,
        priceCents: 100000,
        gstCents: 18000,
        commissionPct: 20,
        status: "confirmed" as const,
      })),
    });
    await prisma.sessionRating.createMany({
      data: bookings.map((b, i) => ({
        bookingId: b.id,
        userId,
        professionalId: coachId,
        stars: i < 10 ? 1 : 5,
        createdAt: new Date(base + i * DAY),
      })),
    });
    const all = await listMyRatings(coachId);
    expect(all.items).toHaveLength(100);
    expect(all.count).toBe(110);
    expect(all.average).toBe(4.6); // (10*1 + 100*5) / 110 = 4.636…
    const one = await listMyRatings(coachId, userId);
    expect(one.count).toBe(110);
  });
});
