import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { REQUEST_REPLY_WINDOW_MS } from "../src/lib/relationshipActivation";
import {
  acceptRelationship,
  cancelGuidanceRequest,
  createGuidanceRequest,
  listPendingRelationships,
  listRelationshipStatus,
} from "../src/modules/coaching/coaching.service";

/**
 * Asking a coach for guidance before paying (Figma coach/02, 05, 07; 25 Oct
 * 2026): the request keeps what the member asked for, the coach has a reply
 * window, a lapsed request ends instead of waiting forever, and the member can
 * take a request back. Service-level, against the real database, like
 * relationshipAcceptanceGate.test.ts.
 */
describe("Guidance request: ask, reply window, cancel", () => {
  let userId: string;
  let professionalId: string;
  let offeringId: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;

  const dayFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const relationship = () =>
    prisma.relationship.findUnique({
      where: { userId_professionalId_serviceType: { userId, professionalId, serviceType: "fitness" } },
    });

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("guidance-request"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Guidance Request Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const professional = await prisma.professional.create({
      data: {
        email: `coach-guidance-request-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Guidance Request Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;
    await prisma.professionalCredential.create({ data: { professionalId, serviceType: "fitness", status: "verified" } });

    pricing = await createPricedOffering(professionalId, {
      serviceType: "fitness",
      feeCents: 1500,
      durationMinutes: 45,
      label: "Strength review",
    });
    offeringId = pricing.offering.id;
  });

  afterEach(async () => {
    await prisma.relationship.deleteMany({ where: { professionalId } });
  });

  afterAll(async () => {
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await pricing?.cleanup();
    await prisma.professionalCredential.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates a requested relationship that keeps the service, day and note, with no payment", async () => {
    const result = await createGuidanceRequest(userId, {
      professionalId,
      serviceType: "fitness",
      offeringId,
      preferredDate: dayFromNow(3),
      note: "  Bad knee, no running  ",
    });
    expect(result).toMatchObject({ status: "requested", created: true });
    expect(new Date(result.replyBy as Date).getTime()).toBeGreaterThan(Date.now() + REQUEST_REPLY_WINDOW_MS - 60_000);

    const row = await relationship();
    expect(row).toMatchObject({ status: "requested", requestedOfferingId: offeringId, requestNote: "Bad knee, no running" });
    expect(row?.preferredDate?.toISOString().slice(0, 10)).toBe(dayFromNow(3));
    expect(row?.requestedAt).toBeTruthy();
    expect(await prisma.payment.count({ where: { userId } })).toBe(0);

    const status = await listRelationshipStatus(userId);
    expect(status.relationships).toHaveLength(1);
    expect(status.relationships[0]).toMatchObject({
      status: "requested",
      offeringId,
      serviceName: "Strength review",
      note: "Bad knee, no running",
    });
    expect(status.relationships[0].replyBy).toBeTruthy();
  });

  it("asking again while waiting updates the details and does not restart the reply window", async () => {
    await createGuidanceRequest(userId, { professionalId, serviceType: "fitness", note: "first" });
    const before = await relationship();
    const again = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness", offeringId, note: "second" });
    expect(again).toMatchObject({ status: "requested", created: true });
    const after = await relationship();
    expect(after?.requestNote).toBe("second");
    expect(after?.requestedOfferingId).toBe(offeringId);
    expect(after?.requestedAt?.getTime()).toBe(before?.requestedAt?.getTime());
  });

  it("refuses an offering that is not this coach's, a service the coach isn't verified for, and a date out of range", async () => {
    await expect(
      createGuidanceRequest(userId, { professionalId, serviceType: "fitness", offeringId: "does-not-exist" }),
    ).rejects.toMatchObject({ status: 404, code: "offering_not_found" });
    await expect(createGuidanceRequest(userId, { professionalId, serviceType: "nutrition" })).rejects.toMatchObject({
      status: 400,
      code: "service_not_offered",
    });
    await expect(
      createGuidanceRequest(userId, { professionalId, serviceType: "fitness", preferredDate: dayFromNow(-2) }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_preferred_date" });
    await expect(
      createGuidanceRequest(userId, { professionalId, serviceType: "fitness", preferredDate: dayFromNow(90) }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_preferred_date" });
    expect(await relationship()).toBeNull();
  });

  it("a coach's accept stamps acceptedAt, and asking again after that changes nothing", async () => {
    const { relationshipId } = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness", offeringId });
    await acceptRelationship(professionalId, relationshipId);
    const row = await relationship();
    expect(row?.status).toBe("accepted");
    expect(row?.acceptedAt).toBeTruthy();

    const again = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness", offeringId, note: "changed my mind" });
    expect(again).toMatchObject({ status: "accepted", created: false });
    expect((await relationship())?.requestNote).toBeNull();
  });

  it("a request nobody answered in 48 hours expires on the member's next look, and the coach can't accept it", async () => {
    const { relationshipId } = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness", offeringId });
    await prisma.relationship.update({
      where: { id: relationshipId },
      data: { requestedAt: new Date(Date.now() - REQUEST_REPLY_WINDOW_MS - 60_000) },
    });

    // The coach's own pending list drops it too.
    expect((await listPendingRelationships(professionalId)).requests).toHaveLength(0);

    const status = await listRelationshipStatus(userId);
    expect(status.relationships).toHaveLength(1);
    expect(status.relationships[0]).toMatchObject({ status: "expired", replyBy: null });
    expect((await relationship())?.endReason).toBe("no_reply");

    await expect(acceptRelationship(professionalId, relationshipId)).rejects.toMatchObject({ status: 409 });
  });

  it("a coach can't accept an overdue request before the member has looked at it", async () => {
    const { relationshipId } = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness" });
    await prisma.relationship.update({
      where: { id: relationshipId },
      data: { requestedAt: new Date(Date.now() - REQUEST_REPLY_WINDOW_MS - 60_000) },
    });
    await expect(acceptRelationship(professionalId, relationshipId)).rejects.toMatchObject({
      status: 409,
      code: "relationship_expired",
    });
    expect((await relationship())?.status).toBe("expired");
  });

  it("an old request with no requestedAt counts from when it was created", async () => {
    const { relationshipId } = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness" });
    await prisma.relationship.update({
      where: { id: relationshipId },
      data: { requestedAt: null, createdAt: new Date(Date.now() - REQUEST_REPLY_WINDOW_MS - 60_000) },
    });
    const status = await listRelationshipStatus(userId);
    expect(status.relationships[0].status).toBe("expired");
  });

  it("an expired request can be made again, with a fresh window and none of the old details", async () => {
    const first = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness", offeringId, note: "old" });
    await prisma.relationship.update({
      where: { id: first.relationshipId },
      data: { requestedAt: new Date(Date.now() - REQUEST_REPLY_WINDOW_MS - 60_000) },
    });
    await listRelationshipStatus(userId);
    expect((await relationship())?.status).toBe("expired");

    const second = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness" });
    expect(second).toMatchObject({ status: "requested", created: true, relationshipId: first.relationshipId });
    const row = await relationship();
    expect(row).toMatchObject({ status: "requested", requestedOfferingId: null, requestNote: null, endedAt: null });
    expect(Date.now() - (row?.requestedAt?.getTime() ?? 0)).toBeLessThan(60_000);
  });

  it("the member can cancel while it is requested or accepted, but not someone else's, and not once it is further along", async () => {
    const other = await prisma.user.create({
      data: {
        email: uniqueEmail("guidance-request-other"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Guidance Request Other User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    try {
      const { relationshipId } = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness" });
      await expect(cancelGuidanceRequest(other.id, relationshipId)).rejects.toMatchObject({ status: 404 });

      await cancelGuidanceRequest(userId, relationshipId);
      expect(await relationship()).toMatchObject({ status: "ended", endReason: "cancelled_by_member" });
      expect((await listRelationshipStatus(userId)).relationships).toHaveLength(0);
      expect((await listPendingRelationships(professionalId)).requests).toHaveLength(0);
      await expect(cancelGuidanceRequest(userId, relationshipId)).rejects.toMatchObject({ status: 409 });

      // Asking the same coach again after cancelling starts a new request.
      const again = await createGuidanceRequest(userId, { professionalId, serviceType: "fitness" });
      expect(again).toMatchObject({ status: "requested", created: true });

      // Accepted can still be cancelled; once a payment started it can't.
      await acceptRelationship(professionalId, again.relationshipId);
      await prisma.relationship.update({ where: { id: again.relationshipId }, data: { status: "awaiting_payment" } });
      await expect(cancelGuidanceRequest(userId, again.relationshipId)).rejects.toMatchObject({
        status: 409,
        code: "relationship_not_cancellable",
      });
      await prisma.relationship.update({ where: { id: again.relationshipId }, data: { status: "accepted" } });
      await cancelGuidanceRequest(userId, again.relationshipId);
      expect((await relationship())?.status).toBe("ended");
    } finally {
      await prisma.user.deleteMany({ where: { id: other.id } });
    }
  });

  it("the coach's pending list shows what was asked for", async () => {
    await createGuidanceRequest(userId, {
      professionalId,
      serviceType: "fitness",
      offeringId,
      preferredDate: dayFromNow(2),
      note: "Prefer mornings",
    });
    const { requests } = await listPendingRelationships(professionalId);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ serviceName: "Strength review", note: "Prefer mornings" });
    expect(requests[0].replyBy).toBeTruthy();
  });
});
