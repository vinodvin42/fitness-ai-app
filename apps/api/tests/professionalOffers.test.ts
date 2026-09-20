import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { createOffer, acceptOffer, declineOffer } from "../src/modules/professionalOffers/professionalOffers.service";

/**
 * R2 Wave 2 (20 Sep 2026) — ProfessionalOffer, the admin/system-proposes-a-
 * specific-pro stage Developer 2's real R1 work package §2 names
 * (`APPROVED -> AVAILABLE -> OFFERED/ASSIGNED -> ACCEPTED -> ...`), distinct
 * from the existing user-initiated Relationship request flow. See
 * professionalOffers.service.ts's own doc comment for the full design,
 * including why `acceptOffer` calls into coaching.service.ts's own
 * `claimRelationship()`/`acceptRelationship()` rather than duplicating
 * relationship-creation logic.
 *
 * Real, Postgres-backed integration test, same "no mocked Prisma/Express"
 * discipline as the rest of this directory.
 */
describe("Professional Offers (admin proposes a specific pro -> coach accepts/declines -> real Relationship)", () => {
  const app = buildApp();
  const adminPassword = "OfferAdminPass9!";

  let adminId: string;
  let adminEmail: string;
  let adminToken: string;

  let availableProfessionalId: string;
  let unavailableProfessionalId: string;
  let userId: string;

  const cleanupProfessionalIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    const passwordHash = await hashPassword(adminPassword);
    adminEmail = uniqueEmail("offer-admin");
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: "Offer Test Admin",
        role: "coach_operations",
        status: "active",
      },
    });
    adminId = admin.id;

    const adminLoginRes = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.token;

    const suffix = uniqueSuffix();

    const availableProfessional = await prisma.professional.create({
      data: {
        email: `offer-available-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Available Fixture Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 15,
      },
    });
    availableProfessionalId = availableProfessional.id;
    cleanupProfessionalIds.push(availableProfessionalId);

    const unavailableProfessional = await prisma.professional.create({
      data: {
        email: `offer-unavailable-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Unavailable Fixture Coach",
        status: "active",
        lifecycleStatus: "approved", // not yet `available` — no verified credential
        maxActiveClients: 15,
      },
    });
    unavailableProfessionalId = unavailableProfessional.id;
    cleanupProfessionalIds.push(unavailableProfessionalId);

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("offer-user"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;
    cleanupUserIds.push(userId);
  });

  afterAll(async () => {
    await prisma.professionalOffer.deleteMany({ where: { professionalId: { in: cleanupProfessionalIds } } });
    await prisma.relationship.deleteMany({ where: { professionalId: { in: cleanupProfessionalIds } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "ProfessionalOffer" } });
    await prisma.professional.deleteMany({ where: { id: { in: cleanupProfessionalIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("rejects createOffer for a professional who isn't 'available' (real precondition, not a guess)", async () => {
    await expect(
      createOffer(adminId, { professionalId: unavailableProfessionalId, userId, serviceType: "fitness" }),
    ).rejects.toMatchObject({ status: 409, code: "professional_not_available" });

    const offers = await prisma.professionalOffer.findMany({ where: { professionalId: unavailableProfessionalId } });
    expect(offers).toHaveLength(0);
  });

  it("creates a real offer for an available professional via the admin HTTP route, and records a real audit entry", async () => {
    const res = await request(app)
      .post("/admin/professional-offers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ professionalId: availableProfessionalId, userId, serviceType: "fitness" });
    expect(res.status).toBe(201);
    expect(res.body.offer.status).toBe("offered");
    expect(res.body.offer.proposedByAdminId).toBe(adminId);

    const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: res.body.offer.id } });
    expect(dbOffer).not.toBeNull();
    expect(dbOffer?.status).toBe("offered");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "ProfessionalOffer", entityId: res.body.offer.id, action: "professional_offer.created" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorAdminId).toBe(adminId);
  });

  it("lists the offer for the professional via the real coach-facing route", async () => {
    const professionalToken = signProfessionalAccessToken({
      sub: availableProfessionalId,
      email: `offer-available-coach-list@example.com`,
    }).token;

    const res = await request(app)
      .get("/professionals/me/offers")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.offers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.offers.every((o: { status: string }) => o.status === "offered")).toBe(true);
  });

  it("declining an offer moves it to 'declined' and creates no Relationship", async () => {
    const offer = await prisma.professionalOffer.create({
      data: {
        professionalId: availableProfessionalId,
        userId,
        serviceType: "nutrition",
        status: "offered",
        proposedByAdminId: adminId,
      },
    });

    const result = await declineOffer(availableProfessionalId, offer.id, "not a good fit right now");
    expect(result.status).toBe("declined");

    const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: offer.id } });
    expect(dbOffer?.status).toBe("declined");
    expect(dbOffer?.respondedAt).not.toBeNull();

    const relationship = await prisma.relationship.findUnique({
      where: { userId_professionalId_serviceType: { userId, professionalId: availableProfessionalId, serviceType: "nutrition" } },
    });
    expect(relationship).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "ProfessionalOffer", entityId: offer.id, action: "professional_offer.declined" },
    });
    expect(audit).not.toBeNull();
  });

  it("declining an already-responded offer 409s rather than silently re-declining", async () => {
    const offer = await prisma.professionalOffer.create({
      data: {
        professionalId: availableProfessionalId,
        userId,
        serviceType: "nutrition",
        status: "declined",
        respondedAt: new Date(),
        proposedByAdminId: adminId,
      },
    });

    await expect(declineOffer(availableProfessionalId, offer.id)).rejects.toMatchObject({
      status: 409,
      code: "offer_not_offered",
    });
  });

  it("accepting an offer creates a real, accepted Relationship row via coaching.service.ts's own claim/accept logic", async () => {
    const acceptUser = await prisma.user.create({
      data: {
        email: uniqueEmail("offer-accept-user"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Accept Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    cleanupUserIds.push(acceptUser.id);

    const offer = await prisma.professionalOffer.create({
      data: {
        professionalId: availableProfessionalId,
        userId: acceptUser.id,
        serviceType: "fitness",
        status: "offered",
        proposedByAdminId: adminId,
      },
    });

    const result = await acceptOffer(availableProfessionalId, offer.id);
    expect(result.status).toBe("accepted");
    expect(result.relationshipId).toBeTruthy();

    const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: offer.id } });
    expect(dbOffer?.status).toBe("accepted");
    expect(dbOffer?.respondedAt).not.toBeNull();

    // The real convergence point: a genuine Relationship row exists for
    // this professional/user pair, created through coaching.service.ts's
    // own claimRelationship(), and — since the coach already said yes via
    // the offer — immediately moved to `accepted` too via that same
    // module's real acceptRelationship(), not left at `requested` a second
    // time for the same coach to review twice.
    const relationship = await prisma.relationship.findUnique({
      where: {
        userId_professionalId_serviceType: { userId: acceptUser.id, professionalId: availableProfessionalId, serviceType: "fitness" },
      },
    });
    expect(relationship).not.toBeNull();
    expect(relationship?.id).toBe(result.relationshipId);
    expect(relationship?.status).toBe("accepted");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "ProfessionalOffer", entityId: offer.id, action: "professional_offer.accepted" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorProfessionalId).toBe(availableProfessionalId);
  });

  it("accepting an already-responded offer 409s rather than silently re-accepting", async () => {
    const anotherUser = await prisma.user.create({
      data: {
        email: uniqueEmail("offer-already-responded-user"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Already Responded Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    cleanupUserIds.push(anotherUser.id);

    const offer = await prisma.professionalOffer.create({
      data: {
        professionalId: availableProfessionalId,
        userId: anotherUser.id,
        serviceType: "fitness",
        status: "declined",
        respondedAt: new Date(),
        proposedByAdminId: adminId,
      },
    });

    await expect(acceptOffer(availableProfessionalId, offer.id)).rejects.toMatchObject({
      status: 409,
      code: "offer_not_offered",
    });
  });

  it("refuses to accept an offer belonging to a different professional (ownership check)", async () => {
    const otherProfessional = await prisma.professional.create({
      data: {
        email: uniqueEmail("offer-other-coach"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Other Fixture Coach",
        status: "active",
        lifecycleStatus: "available",
      },
    });
    cleanupProfessionalIds.push(otherProfessional.id);

    const offer = await prisma.professionalOffer.create({
      data: {
        professionalId: availableProfessionalId,
        userId,
        serviceType: "nutrition",
        status: "offered",
        proposedByAdminId: adminId,
      },
    });

    await expect(acceptOffer(otherProfessional.id, offer.id)).rejects.toMatchObject({
      status: 404,
      code: "offer_not_found",
    });

    // Clean up this one offer separately since its professionalId
    // (availableProfessionalId) is already in the afterAll cleanup set, but
    // it's still 'offered' and would otherwise leak into other assertions.
    await prisma.professionalOffer.deleteMany({ where: { id: offer.id } });
  });

  it(
    "concurrency: exactly one of two concurrent acceptOffer() calls for the same offer wins, and exactly one Relationship results",
    async () => {
      const raceUser = await prisma.user.create({
        data: {
          email: uniqueEmail("offer-race-user"),
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: "Offer Race Fixture User",
          referralCode: await generateUniqueReferralCode(),
        },
      });
      cleanupUserIds.push(raceUser.id);

      const offer = await prisma.professionalOffer.create({
        data: {
          professionalId: availableProfessionalId,
          userId: raceUser.id,
          serviceType: "nutrition",
          status: "offered",
          proposedByAdminId: adminId,
        },
      });

      const results = await Promise.allSettled([
        acceptOffer(availableProfessionalId, offer.id),
        acceptOffer(availableProfessionalId, offer.id),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: "offer_not_offered" });

      const relationships = await prisma.relationship.findMany({
        where: { userId: raceUser.id, professionalId: availableProfessionalId, serviceType: "nutrition" },
      });
      expect(relationships).toHaveLength(1);

      const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: offer.id } });
      expect(dbOffer?.status).toBe("accepted");
    },
  );

  it("acting on an expired offer 410s and never creates a Relationship", async () => {
    const expiredUser = await prisma.user.create({
      data: {
        email: uniqueEmail("offer-expired-user"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Offer Expired Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    cleanupUserIds.push(expiredUser.id);

    const offer = await prisma.professionalOffer.create({
      data: {
        professionalId: availableProfessionalId,
        userId: expiredUser.id,
        serviceType: "fitness",
        status: "offered",
        proposedByAdminId: adminId,
        expiresAt: new Date(Date.now() - 60 * 1000), // already in the past
      },
    });

    await expect(acceptOffer(availableProfessionalId, offer.id)).rejects.toMatchObject({
      status: 410,
      code: "offer_expired",
    });

    const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: offer.id } });
    expect(dbOffer?.status).toBe("expired");

    const relationship = await prisma.relationship.findUnique({
      where: {
        userId_professionalId_serviceType: { userId: expiredUser.id, professionalId: availableProfessionalId, serviceType: "fitness" },
      },
    });
    expect(relationship).toBeNull();
  });

  it("GET /admin/professional-offers/available-professionals lists only professionals genuinely available for new clients", async () => {
    const res = await request(app)
      .get("/admin/professional-offers/available-professionals")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.professionals.map((p: { id: string }) => p.id);
    expect(ids).toContain(availableProfessionalId);
    expect(ids).not.toContain(unavailableProfessionalId);
  });

  it("GET /admin/professional-offers filters by status", async () => {
    const res = await request(app)
      .get("/admin/professional-offers")
      .query({ status: "accepted", professionalId: availableProfessionalId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.offers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.offers.every((o: { status: string }) => o.status === "accepted")).toBe(true);
  });
});
