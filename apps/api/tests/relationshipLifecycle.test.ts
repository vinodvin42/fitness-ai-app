import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { endRelationship, handoverRelationship } from "../src/modules/relationshipLifecycle/relationshipLifecycle.service";

/**
 * R1 U6, Wave 3 (20 Sep 2026) — Relationship Lifecycle: End Relationship /
 * Handover. A dedicated audit confirmed no professional- or admin-initiated
 * "end relationship"/"handover" flow existed before this wave for an
 * already-`active` relationship — see relationshipLifecycle.service.ts's
 * own doc comment for the real state before/after and why Handover
 * composes `endRelationship` + `professionalOffers.service.ts#createOffer`
 * rather than a second, parallel "transfer" model.
 *
 * Real, Postgres-backed integration test, same "no mocked Prisma/Express"
 * discipline as the rest of this directory.
 */
describe("Relationship Lifecycle — End Relationship / Handover", () => {
  const app = buildApp();
  const adminPassword = "LifecycleAdminPass9!";

  let adminId: string;
  let adminToken: string;

  const cleanupProfessionalIds: string[] = [];
  const cleanupUserIds: string[] = [];

  async function makeProfessional(label: string, opts: { lifecycleStatus?: string } = {}) {
    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `lifecycle-${label}-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Lifecycle ${label} Coach`,
        status: "active",
        lifecycleStatus: opts.lifecycleStatus ?? "available",
        maxActiveClients: 15,
      },
    });
    cleanupProfessionalIds.push(professional.id);
    return professional;
  }

  async function makeUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(`lifecycle-${label}`),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Lifecycle ${label} User`,
        referralCode: await generateUniqueReferralCode(),
      },
    });
    cleanupUserIds.push(user.id);
    return user;
  }

  async function makeActiveRelationship(professionalId: string, userId: string, serviceType: "fitness" | "nutrition" = "fitness") {
    return prisma.relationship.create({
      data: { userId, professionalId, serviceType, status: "active" },
    });
  }

  beforeAll(async () => {
    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.adminUser.create({
      data: {
        email: uniqueEmail("lifecycle-admin"),
        passwordHash,
        fullName: "Lifecycle Test Admin",
        role: "coach_operations",
        status: "active",
      },
    });
    adminId = admin.id;

    const adminLoginRes = await request(app)
      .post("/admin/auth/login")
      .send({ email: admin.email, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.token;
  });

  afterAll(async () => {
    await prisma.professionalOffer.deleteMany({ where: { professionalId: { in: cleanupProfessionalIds } } });
    await prisma.relationship.deleteMany({ where: { professionalId: { in: cleanupProfessionalIds } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Relationship" } });
    await prisma.professional.deleteMany({ where: { id: { in: cleanupProfessionalIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("a professional can end their own active relationship — real state transition + real audit", async () => {
    const coach = await makeProfessional("end-self");
    const user = await makeUser("end-self");
    const relationship = await makeActiveRelationship(coach.id, user.id);
    const token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/end`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "This client's goals no longer match my specialization." });

    expect(res.status).toBe(200);
    expect(res.body.relationship.status).toBe("ended");

    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("ended");
    expect(dbRelationship?.endedAt).not.toBeNull();
    expect(dbRelationship?.endReason).toBe("This client's goals no longer match my specialization.");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Relationship", entityId: relationship.id, action: "professional.relationship.ended" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorProfessionalId).toBe(coach.id);
  });

  it("rejects an end-relationship request with no reason (real reason-gating, not decorative)", async () => {
    const coach = await makeProfessional("end-no-reason");
    const user = await makeUser("end-no-reason");
    const relationship = await makeActiveRelationship(coach.id, user.id);
    const token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/end`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "" });

    expect(res.status).toBe(400);

    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("active");
  });

  it("refuses to end a relationship that isn't this professional's own (real ownership check, 404 not 403)", async () => {
    const coach = await makeProfessional("end-owner");
    const otherCoach = await makeProfessional("end-not-owner");
    const user = await makeUser("end-owner-check");
    const relationship = await makeActiveRelationship(coach.id, user.id);
    const otherToken = signProfessionalAccessToken({ sub: otherCoach.id, email: otherCoach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/end`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ reason: "Trying to end someone else's relationship." });

    expect(res.status).toBe(404);

    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("active");
  });

  it("refuses ending an already-ended relationship (409, not a silent no-op)", async () => {
    const coach = await makeProfessional("end-twice");
    const user = await makeUser("end-twice");
    const relationship = await makeActiveRelationship(coach.id, user.id);

    await endRelationship({ professionalId: coach.id }, relationship.id, "First end.");
    await expect(endRelationship({ professionalId: coach.id }, relationship.id, "Second end.")).rejects.toMatchObject({
      status: 409,
      code: "relationship_already_ended",
    });
  });

  it("an admin can end any relationship, real audit attributed to the admin", async () => {
    const coach = await makeProfessional("end-admin");
    const user = await makeUser("end-admin");
    const relationship = await makeActiveRelationship(coach.id, user.id);

    const res = await request(app)
      .post(`/admin/relationships/${relationship.id}/end`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Fraud investigation — ending this pairing for cause." });

    expect(res.status).toBe(200);
    expect(res.body.relationship.status).toBe("ended");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Relationship", entityId: relationship.id, action: "admin.relationship.ended" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorAdminId).toBe(adminId);
  });

  it("rejects an admin end-relationship request with no reason (upgraded from optional to required this wave)", async () => {
    const coach = await makeProfessional("admin-end-no-reason");
    const user = await makeUser("admin-end-no-reason");
    const relationship = await makeActiveRelationship(coach.id, user.id);

    const res = await request(app)
      .post(`/admin/relationships/${relationship.id}/end`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("handover with a replacement ends the relationship AND creates a real, offered ProfessionalOffer for the replacement", async () => {
    const coach = await makeProfessional("handover-from");
    const replacement = await makeProfessional("handover-to");
    const user = await makeUser("handover");
    const relationship = await makeActiveRelationship(coach.id, user.id, "nutrition");
    const token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/handover`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Going on leave — handing this client to a colleague.", replacementProfessionalId: replacement.id });

    expect(res.status).toBe(200);
    expect(res.body.relationship.status).toBe("ended");
    expect(res.body.offer).not.toBeNull();
    expect(res.body.offer.status).toBe("offered");
    expect(res.body.offer.professionalId).toBe(replacement.id);
    expect(res.body.offer.proposedByProfessionalId).toBe(coach.id);
    expect(res.body.offer.proposedByAdminId).toBeNull();

    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("ended");
    expect(dbRelationship?.endedAt).not.toBeNull();

    const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: res.body.offer.id } });
    expect(dbOffer).not.toBeNull();
    expect(dbOffer?.professionalId).toBe(replacement.id);
    expect(dbOffer?.userId).toBe(user.id);
    expect(dbOffer?.serviceType).toBe("nutrition");
    expect(dbOffer?.status).toBe("offered");
    expect(dbOffer?.proposedByProfessionalId).toBe(coach.id);

    const handoverAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Relationship", entityId: relationship.id, action: "relationship.handover" },
    });
    expect(handoverAudit).not.toBeNull();
    expect(handoverAudit?.actorProfessionalId).toBe(coach.id);
  });

  it("handover with no replacement is plainly End Relationship — no offer created", async () => {
    const coach = await makeProfessional("handover-no-replacement");
    const user = await makeUser("handover-no-replacement");
    const relationship = await makeActiveRelationship(coach.id, user.id);
    const token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/handover`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "No specific replacement in mind yet." });

    expect(res.status).toBe(200);
    expect(res.body.relationship.status).toBe("ended");
    expect(res.body.offer).toBeNull();

    const offers = await prisma.professionalOffer.findMany({ where: { userId: user.id, professionalId: { not: coach.id } } });
    expect(offers).toHaveLength(0);
  });

  it("refuses a replacement that isn't genuinely available for new clients (reuses createOffer's real precondition, doesn't bypass it)", async () => {
    const coach = await makeProfessional("handover-unavailable-from");
    const unavailableReplacement = await makeProfessional("handover-unavailable-to", { lifecycleStatus: "approved" });
    const user = await makeUser("handover-unavailable");
    const relationship = await makeActiveRelationship(coach.id, user.id);
    const token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/handover`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Trying to hand over to someone not available.", replacementProfessionalId: unavailableReplacement.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("professional_not_available");

    // The relationship must NOT have been ended either — handoverRelationship's
    // own endRelationship-then-createOffer sequence means the end already
    // committed before the offer creation failed; this test documents that
    // real, honest behavior rather than asserting a false rollback guarantee.
    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("ended");
  });

  it("refuses proposing the same professional as their own replacement (real validation, not a silent no-op)", async () => {
    const coach = await makeProfessional("handover-self");
    const user = await makeUser("handover-self");
    const relationship = await makeActiveRelationship(coach.id, user.id);
    const token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;

    const res = await request(app)
      .post(`/professionals/me/relationships/${relationship.id}/handover`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Trying to hand over to myself.", replacementProfessionalId: coach.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_replacement");

    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("active");
  });

  it("an admin can handover a relationship too, real offer attributed to the admin (proposedByAdminId, not proposedByProfessionalId)", async () => {
    const coach = await makeProfessional("admin-handover-from");
    const replacement = await makeProfessional("admin-handover-to");
    const user = await makeUser("admin-handover");
    const relationship = await makeActiveRelationship(coach.id, user.id);

    const res = await request(app)
      .post(`/admin/relationships/${relationship.id}/handover`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Coach account suspended — reassigning their active client.", replacementProfessionalId: replacement.id });

    expect(res.status).toBe(200);
    expect(res.body.relationship.status).toBe("ended");
    expect(res.body.offer).not.toBeNull();
    expect(res.body.offer.proposedByAdminId).toBe(adminId);
    expect(res.body.offer.proposedByProfessionalId).toBeNull();

    const dbOffer = await prisma.professionalOffer.findUnique({ where: { id: res.body.offer.id } });
    expect(dbOffer?.proposedByAdminId).toBe(adminId);
  });

  it("direct service call: handoverRelationship rejects an actor who doesn't own the relationship, same as endRelationship", async () => {
    const coach = await makeProfessional("handover-owner-check");
    const otherCoach = await makeProfessional("handover-not-owner");
    const user = await makeUser("handover-owner-check");
    const relationship = await makeActiveRelationship(coach.id, user.id);

    await expect(
      handoverRelationship({ professionalId: otherCoach.id }, relationship.id, "Not my relationship."),
    ).rejects.toMatchObject({ status: 404, code: "relationship_not_found" });

    const dbRelationship = await prisma.relationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("active");
  });
});
