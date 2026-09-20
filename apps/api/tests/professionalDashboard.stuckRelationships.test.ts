import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Stuck-relationship signal (Wave 3, 20 Sep 2026) — GET /professionals/me/
 * dashboard's read-time detection of a `Relationship` left at `activating`
 * past professionalDashboard.service.ts's STUCK_ACTIVATING_THRESHOLD_MS.
 * See coaching.service.ts's createBooking doc comment for the real path
 * that can leave a relationship at `activating` (a booking-creation
 * failure after the relationship has already been advanced past
 * `awaiting_payment`) — this suite doesn't drive that failure path itself
 * (it's a rare DB-level race), it directly seeds a Relationship row already
 * sitting at `activating` with an old `updatedAt`, the same "fixture the
 * state directly rather than the whole path that produces it" precedent
 * this test directory already uses elsewhere for hard-to-trigger states.
 */
describe("Stuck-relationship detection surfaces on the coach dashboard and queues an AdminActionItem", () => {
  const app = buildApp();
  let userId: string;
  let professionalId: string;
  let professionalEmail: string;
  let professionalAccessToken: string;
  let relationshipId: string;

  afterAll(async () => {
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Relationship", entityId: relationshipId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("seeds a Relationship stuck in `activating` well past the threshold", async () => {
    const userEmail = uniqueEmail("stuck-rel-user");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Stuck Relationship Tester" });
    expect(signupRes.status).toBe(201);
    userId = signupRes.body.user.id;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `stuck-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Stuck Test Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;
    professionalEmail = professional.email;
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professionalEmail }).token;

    // Well past the 15-minute STUCK_ACTIVATING_THRESHOLD_MS.
    const staleUpdatedAt = new Date(Date.now() - 60 * 60 * 1000);
    const relationship = await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "fitness", status: "activating" },
    });
    // `updatedAt` is @updatedAt-managed — Prisma stamps it fresh on create,
    // so it has to be pushed back with a raw update to simulate "stuck a
    // while ago" rather than "just entered activating".
    await prisma.$executeRaw`UPDATE "relationships" SET "updatedAt" = ${staleUpdatedAt} WHERE "id" = ${relationship.id}`;
    relationshipId = relationship.id;
  });

  it("surfaces the stuck relationship on GET /professionals/me/dashboard and creates exactly one open AdminActionItem", async () => {
    const res = await request(app)
      .get("/professionals/me/dashboard")
      .set("Authorization", `Bearer ${professionalAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stuckRelationships).toHaveLength(1);
    expect(res.body.stuckRelationships[0]).toMatchObject({
      relationshipId,
      clientFullName: "Stuck Relationship Tester",
      serviceType: "fitness",
    });

    const actionItems = await prisma.adminActionItem.findMany({
      where: { type: "relationship_activation_failed", entityType: "Relationship", entityId: relationshipId },
    });
    expect(actionItems).toHaveLength(1);
    expect(actionItems[0].status).toBe("open");
    expect(actionItems[0].severity).toBe("high");
  });

  it("does not create a second AdminActionItem on a repeat dashboard read (dedup against the existing open row)", async () => {
    const res = await request(app)
      .get("/professionals/me/dashboard")
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stuckRelationships).toHaveLength(1);

    const actionItems = await prisma.adminActionItem.findMany({
      where: { type: "relationship_activation_failed", entityType: "Relationship", entityId: relationshipId },
    });
    expect(actionItems).toHaveLength(1);
  });
});
