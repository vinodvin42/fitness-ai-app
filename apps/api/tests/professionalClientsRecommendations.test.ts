import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Wave 2.4 (20 Sep 2026) — a professional reviewing a client's real AI Plan
 * Recommendations, gated on a real active `Relationship`. Wires
 * `plans.service.ts#decideRecommendation`'s pre-existing
 * `decidedByRole: "professional"` parameter (see that file's own doc
 * comment) through a real caller for the first time — this suite exercises
 * that the parameter actually lands on the `Recommendation` row, not just
 * that the HTTP call returns 200.
 *
 * Same "mock only the raw LLM text, everything else real" discipline as
 * plans.test.ts — Recommendation generation itself isn't this suite's
 * focus, just the professional-authed list/decide layer on top of it.
 */
const { generateCompletion, isAiConfigured } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
vi.mock("../src/lib/aiClient", () => ({ generateCompletion, isAiConfigured }));

describe("Professional review of a client's Recommendations", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;
  let otherUserId: string;
  let professionalId: string;
  let professionalAccessToken: string;
  let programAId: string;
  let programBId: string;

  beforeAll(async () => {
    const userEmail = uniqueEmail("prof-clients-rec-user");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Rec Review Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    const otherEmail = uniqueEmail("prof-clients-rec-other");
    const otherSignup = await request(app)
      .post("/auth/signup")
      .send({ email: otherEmail, password: "SomePassword1!", fullName: "Unrelated User" });
    otherUserId = otherSignup.body.user.id;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `rec-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Test Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token;

    const [programA, programB] = await Promise.all([
      prisma.program.create({
        data: {
          id: `test-prof-rec-program-a-${suffix}`,
          name: "Coach Review Beginner Strength",
          type: "fitness",
          description: "Fixture program A for the professional-review recommendation suite.",
          durationWeeks: 4,
          isAiOnly: true,
          priceCents: 0,
          status: "published",
        },
      }),
      prisma.program.create({
        data: {
          id: `test-prof-rec-program-b-${suffix}`,
          name: "Coach Review Intermediate Hypertrophy",
          type: "fitness",
          description: "Fixture program B for the professional-review recommendation suite.",
          durationWeeks: 6,
          isAiOnly: true,
          priceCents: 0,
          status: "published",
        },
      }),
    ]);
    programAId = programA.id;
    programBId = programB.id;

    await prisma.onboardingProfile.upsert({
      where: { userId },
      create: { userId, goals: ["build_muscle"], trainingLevel: "beginner", medicalConditions: [], injuries: [], completedAt: new Date() },
      update: { completedAt: new Date() },
    });
  });

  beforeEach(() => {
    generateCompletion.mockReset();
    isAiConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { userId } });
    await prisma.plan.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.program.deleteMany({ where: { id: { in: [programAId, programBId] } } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("404s listing or deciding a client's recommendations without an active Relationship", async () => {
    const list = await request(app)
      .get(`/professionals/me/clients/${userId}/recommendations`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(list.status).toBe(404);
    expect(list.body.error.code).toBe("client_not_found");

    const decide = await request(app)
      .post(`/professionals/me/clients/${userId}/recommendations/not-a-real-id/decide`)
      .set("Authorization", `Bearer ${professionalAccessToken}`)
      .send({ action: "accept" });
    expect(decide.status).toBe(404);
    expect(decide.body.error.code).toBe("client_not_found");
  });

  describe("once a real active Relationship exists", () => {
    beforeAll(async () => {
      await prisma.relationship.create({
        data: { userId, professionalId, serviceType: "fitness", status: "active" },
      });
    });

    it("lists a real pending Recommendation and decides it, landing decidedByRole: professional on the real row", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Starting plan.`);
      await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      generateCompletion.mockResolvedValueOnce(
        `DECISION: ${programBId}\nRATIONALE: Recent activity suggests a program change would help.`,
      );
      const generated = await request(app)
        .post("/recommendations/generate")
        .set("Authorization", `Bearer ${accessToken}`)
        .send();
      expect(generated.status).toBe(201);
      const recommendationId = generated.body.id;

      const list = await request(app)
        .get(`/professionals/me/clients/${userId}/recommendations`)
        .set("Authorization", `Bearer ${professionalAccessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.recommendations).toHaveLength(1);
      expect(list.body.recommendations[0].id).toBe(recommendationId);
      expect(list.body.recommendations[0].status).toBe("active");
      expect(list.body.recommendations[0].suggestedProgramId).toBe(programBId);

      const decide = await request(app)
        .post(`/professionals/me/clients/${userId}/recommendations/${recommendationId}/decide`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ action: "accept" });
      expect(decide.status).toBe(200);
      expect(decide.body.status).toBe("accepted");
      expect(decide.body.decidedByRole).toBe("professional");

      // Confirm directly against Postgres — not just trusting the 200 response.
      const dbRow = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
      expect(dbRow?.status).toBe("accepted");
      expect(dbRow?.decidedByRole).toBe("professional");
      expect(dbRow?.decidedAt).not.toBeNull();

      const plan = await request(app).get("/plans/current").set("Authorization", `Bearer ${accessToken}`).send();
      expect(plan.body.plan.programId).toBe(programBId);

      // Now decided — the list no longer shows it as pending.
      const listAfter = await request(app)
        .get(`/professionals/me/clients/${userId}/recommendations`)
        .set("Authorization", `Bearer ${professionalAccessToken}`);
      expect(listAfter.body.recommendations).toHaveLength(0);
    });

    it("rejects re-deciding an already-decided recommendation (guard preserved from decideRecommendation)", async () => {
      generateCompletion.mockResolvedValueOnce("DECISION: NO_CHANGE\nRATIONALE: Fine for now.");
      const generated = await request(app)
        .post("/recommendations/generate")
        .set("Authorization", `Bearer ${accessToken}`)
        .send();
      const recommendationId = generated.body.id;

      const first = await request(app)
        .post(`/professionals/me/clients/${userId}/recommendations/${recommendationId}/decide`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ action: "decline" });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/professionals/me/clients/${userId}/recommendations/${recommendationId}/decide`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ action: "accept" });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("recommendation_already_decided");
    });

    it("404s deciding a recommendation that belongs to a different (unrelated) user, even with a valid recommendation id shape", async () => {
      const decide = await request(app)
        .post(`/professionals/me/clients/${otherUserId}/recommendations/some-id/decide`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ action: "accept" });
      // No Relationship to otherUserId at all — 404 before even reaching decideRecommendation.
      expect(decide.status).toBe(404);
      expect(decide.body.error.code).toBe("client_not_found");
    });
  });
});
