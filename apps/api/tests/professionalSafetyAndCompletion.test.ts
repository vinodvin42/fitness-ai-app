import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { decryptStringList } from "../src/lib/fieldCrypto";

const app = buildApp();

/**
 * P-M11 ("Programme completed / relationship ended state — 'Complete
 * programme' has no result") and P-M12 ("Client safety flag +
 * escalation route. Pain is handled only inside chat").
 */
describe("Professional app — programme completion and safety flags", () => {
  let professionalId = "";
  let token = "";
  let userId = "";
  let relationshipId = "";
  const PASSWORD = "ProPass123!";
  const suffix = uniqueSuffix();

  beforeAll(async () => {
    const email = `pro-complete-${suffix}@example.com`;
    const pro = await prisma.professional.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: "Completion Fixture Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 20,
      },
    });
    professionalId = pro.id;

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("completion-client"),
        passwordHash: await hashPassword("unused"),
        fullName: "Completion Fixture Client",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const rel = await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "fitness", status: "active" },
    });
    relationshipId = rel.id;

    const login = await request(app).post("/professionals/auth/login").send({ email, password: PASSWORD });
    token = login.body.tokens?.accessToken ?? login.body.accessToken ?? login.body.token;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "SafetyEscalation" } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  describe("P-M12 safety flag", () => {
    it("raises a real escalation with the concern encrypted", async () => {
      const concern = "Client reported chest tightness during the warm-up and again at the end of the session.";
      const res = await request(app)
        .post(`/professionals/me/clients/${userId}/safety-flag`)
        .set(auth())
        .send({ concern, urgent: true });
      expect(res.status).toBe(201);

      const escalation = await prisma.safetyEscalation.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      expect(escalation).not.toBeNull();
      // §10 — the coach's words about this person's health are health
      // data, encrypted like any other.
      expect(escalation!.medicalConditions).toEqual([]);
      expect(JSON.stringify(escalation)).not.toContain("chest tightness");
      expect(decryptStringList(escalation!.medicalConditionsEnc)).toEqual([concern]);
    });

    it("queues it at high severity when the coach marks it urgent", async () => {
      const escalation = await prisma.safetyEscalation.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      const items = await prisma.adminActionItem.findMany({
        where: { entityType: "SafetyEscalation", entityId: escalation!.id },
      });
      expect(items).toHaveLength(1);
      expect(items[0].severity).toBe("high");
      // A coach raising a flag has already applied judgement, so it
      // outranks the automatic onboarding escalations.
      expect(items[0].metadata).toMatchObject({ raisedByProfessionalId: professionalId });
    });

    it("records the professional as the actor, not the client", async () => {
      const escalation = await prisma.safetyEscalation.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "SafetyEscalation", entityId: escalation!.id },
      });
      expect(audit?.actorProfessionalId).toBe(professionalId);
      expect(audit?.ruleId).toBe("BR-SAF-004");
    });

    it("refuses a concern too short to act on", async () => {
      const res = await request(app)
        .post(`/professionals/me/clients/${userId}/safety-flag`)
        .set(auth())
        .send({ concern: "worried", urgent: false });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("refuses a client this professional has no relationship with", async () => {
      const stranger = await prisma.user.create({
        data: {
          email: uniqueEmail("stranger"),
          passwordHash: await hashPassword("unused"),
          fullName: "Not My Client",
          referralCode: await generateUniqueReferralCode(),
        },
      });
      const res = await request(app)
        .post(`/professionals/me/clients/${stranger.id}/safety-flag`)
        .set(auth())
        .send({ concern: "Trying to flag someone who isn't my client at all.", urgent: false });
      expect(res.status).toBe(404);
      await prisma.user.deleteMany({ where: { id: stranger.id } });
    });
  });

  describe("P-M11 programme completion", () => {
    it("completes the relationship and revokes access", async () => {
      const res = await request(app)
        .post(`/professionals/me/relationships/${relationshipId}/complete`)
        .set(auth())
        .send({ reason: "Twelve-week programme finished, goals met." });
      expect(res.status).toBe(200);

      const stored = await prisma.relationship.findUnique({ where: { id: relationshipId } });
      // COMPLETED, not ENDED — §10 treats them differently and so must
      // the data, or a completion summary cannot be told from a breakup.
      expect(stored!.status).toBe("completed");
      expect(stored!.endedAt).not.toBeNull();

      const revoked = await prisma.auditLog.findFirst({
        where: { entityType: "Relationship", entityId: relationshipId, action: "access.revoked" },
      });
      expect(revoked).not.toBeNull();
      expect(revoked?.metadata).toMatchObject({ cause: "completed" });
    });

    it("refuses to complete a relationship that isn't active", async () => {
      const res = await request(app)
        .post(`/professionals/me/relationships/${relationshipId}/complete`)
        .set(auth())
        .send({ reason: "Trying to complete it twice over." });
      expect(res.status).toBe(409);
    });

    it("refuses a relationship belonging to another professional", async () => {
      const other = await prisma.professional.create({
        data: {
          email: `pro-other-${suffix}@example.com`,
          passwordHash: await hashPassword(PASSWORD),
          fullName: "Other Coach",
          status: "active",
          lifecycleStatus: "available",
        },
      });
      const otherRel = await prisma.relationship.create({
        data: { userId, professionalId: other.id, serviceType: "nutrition", status: "active" },
      });

      const res = await request(app)
        .post(`/professionals/me/relationships/${otherRel.id}/complete`)
        .set(auth())
        .send({ reason: "Completing somebody else's relationship." });
      expect(res.status).toBe(404);

      await prisma.relationship.deleteMany({ where: { id: otherRel.id } });
      await prisma.professional.deleteMany({ where: { id: other.id } });
    });
  });
});
