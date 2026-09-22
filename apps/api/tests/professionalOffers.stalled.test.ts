import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";

/**
 * Stalled-offer detection (Wave 6, 22 Sep 2026) — GET /admin/professional-
 * offers's read-time detection of a `ProfessionalOffer` left at `offered`
 * past professionalOffers.service.ts's STALLED_OFFER_THRESHOLD_MS (72
 * hours). See that file's own doc comment on `detectAndQueueStalledOffers`
 * for the full "why 72 hours, why distinct from `expiresAt`" reasoning —
 * mirrors professionalDashboard.stuckRelationships.test.ts's own "fixture
 * the state directly rather than the whole path that produces it"
 * precedent: this seeds a `ProfessionalOffer` already `offered` with an old
 * `createdAt` rather than waiting 72 real hours.
 */
describe("Stalled-offer detection surfaces via the admin offers read and queues an AdminActionItem", () => {
  const app = buildApp();
  const adminPassword = "StalledOfferAdmin9!";

  let adminId: string;
  let adminToken: string;
  let professionalId: string;
  let userId: string;
  let offerId: string;

  afterAll(async () => {
    await prisma.adminActionItem.deleteMany({ where: { entityType: "ProfessionalOffer", entityId: offerId } });
    await prisma.professionalOffer.deleteMany({ where: { professionalId } });
    await prisma.auditLog.deleteMany({ where: { entityType: "ProfessionalOffer", entityId: offerId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("seeds a ProfessionalOffer stuck at `offered` well past the 72-hour threshold", async () => {
    const passwordHash = await hashPassword(adminPassword);
    const adminEmail = uniqueEmail("stalled-offer-admin");
    const admin = await prisma.adminUser.create({
      data: { email: adminEmail, passwordHash, fullName: "Stalled Offer Test Admin", role: "coach_operations", status: "active" },
    });
    adminId = admin.id;

    const adminLoginRes = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.token;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `stalled-offer-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Stalled Offer Fixture Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 15,
      },
    });
    professionalId = professional.id;

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("stalled-offer-user"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Stalled Offer Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const offer = await prisma.professionalOffer.create({
      data: { professionalId, userId, serviceType: "fitness", status: "offered", proposedByAdminId: adminId },
    });
    offerId = offer.id;

    // Well past the 72-hour STALLED_OFFER_THRESHOLD_MS.
    const staleCreatedAt = new Date(Date.now() - 96 * 60 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "professional_offers" SET "createdAt" = ${staleCreatedAt} WHERE "id" = ${offerId}`;
  });

  it("surfaces on GET /admin/professional-offers and creates exactly one open AdminActionItem", async () => {
    const res = await request(app)
      .get("/admin/professional-offers")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ professionalId });
    expect(res.status).toBe(200);
    expect(res.body.offers.some((o: { offerId: string }) => o.offerId === offerId)).toBe(true);

    const actionItems = await prisma.adminActionItem.findMany({
      where: { type: "professional_acceptance_stalled", entityType: "ProfessionalOffer", entityId: offerId },
    });
    expect(actionItems).toHaveLength(1);
    expect(actionItems[0].status).toBe("open");
    expect(actionItems[0].severity).toBe("medium");
    expect(actionItems[0].metadata).toMatchObject({ userId, professionalId });
  });

  it("does not create a second AdminActionItem on a repeat admin read (dedup against the existing open row)", async () => {
    const res = await request(app)
      .get("/admin/professional-offers")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ professionalId });
    expect(res.status).toBe(200);

    const actionItems = await prisma.adminActionItem.findMany({
      where: { type: "professional_acceptance_stalled", entityType: "ProfessionalOffer", entityId: offerId },
    });
    expect(actionItems).toHaveLength(1);
  });
});
