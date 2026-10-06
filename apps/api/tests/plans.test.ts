import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Plan-Generation / Recommendation Engine (14 Sep 2026) — see
 * apps/api/src/modules/plans/plans.service.ts's own doc comment for the
 * full design. Unlike this directory's other integration tests, the real
 * LLM call is mocked (`vi.mock("../src/lib/aiClient")`) rather than left
 * to hit the real "unconfigured in every test/dev/CI environment" 503 —
 * same reasoning `aiClient.test.ts` already established: no environment
 * here has ever had real Razorpay credentials, and likewise this suite
 * shouldn't depend on a real Azure OpenAI/Anthropic/OpenAI key just to
 * verify the selection/validation logic. Everything BELOW the AI call
 * (Prisma writes, state transitions, the real Program catalog) is real —
 * only `generateCompletion`'s raw text response is faked, per test.
 */
const { generateCompletion, isAiConfigured } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
vi.mock("../src/lib/aiClient", () => ({ generateCompletion, isAiConfigured }));

describe("Plan-Generation / Recommendation Engine", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  let programAId: string;
  let programBId: string;

  beforeAll(async () => {
    userEmail = uniqueEmail("plans");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Plans Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    const suffix = `${Date.now()}`;
    const [programA, programB] = await Promise.all([
      prisma.program.create({
        data: {
          id: `test-plan-program-a-${suffix}`,
          name: "Test Beginner Strength",
          type: "fitness",
          description: "A fixture program for the plan-generation test suite.",
          durationWeeks: 4,
          isAiOnly: true,
          priceCents: 0,
          status: "published",
        },
      }),
      prisma.program.create({
        data: {
          id: `test-plan-program-b-${suffix}`,
          name: "Test Intermediate Hypertrophy",
          type: "fitness",
          description: "A second fixture program for the plan-generation test suite.",
          durationWeeks: 6,
          isAiOnly: true,
          priceCents: 0,
          status: "published",
        },
      }),
    ]);
    programAId = programA.id;
    programBId = programB.id;
  });

  beforeEach(() => {
    generateCompletion.mockReset();
    isAiConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { userId } });
    await prisma.plan.deleteMany({ where: { userId } });
    await prisma.program.deleteMany({ where: { id: { in: [programAId, programBId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rejects generating a plan before the assessment (onboarding) is complete", async () => {
    const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("assessment_incomplete");
    expect(generateCompletion).not.toHaveBeenCalled();
  });

  it("503s cleanly when the AI provider isn't configured, without touching the database", async () => {
    isAiConfigured.mockReturnValue(false);
    const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("plan_generation_not_configured");
  });

  describe("once the assessment is complete", () => {
    beforeAll(async () => {
      await prisma.onboardingProfile.upsert({
        where: { userId },
        create: {
          userId,
          goals: ["build_muscle"],
          trainingLevel: "beginner",
          medicalConditions: [],
          injuries: [],
          completedAt: new Date(),
        },
        update: { completedAt: new Date() },
      });
    });

    it("generates a real Plan, validating the AI's selection against the real Program catalog", async () => {
      generateCompletion.mockResolvedValueOnce(
        `PROGRAM_ID: ${programAId}\nRATIONALE: Matches this beginner's stated goal of building muscle safely.`,
      );

      const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("generated");
      expect(res.body.programId).toBe(programAId);
      expect(res.body.programName).toBe("Test Beginner Strength");
      expect(res.body.isActive).toBe(true);
      expect(res.body.version).toBe(1);

      const dbPlan = await prisma.plan.findFirst({ where: { userId, isActive: true } });
      expect(dbPlan?.programId).toBe(programAId);
      expect(dbPlan?.status).toBe("generated");
    });

    it("fails honestly (not a fabricated fallback) when the AI names a program id that doesn't exist", async () => {
      generateCompletion.mockResolvedValueOnce("PROGRAM_ID: not-a-real-program\nRATIONALE: Some reason.");

      const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201); // the request itself succeeds; the Plan row records a failed generation
      expect(res.body.status).toBe("failed");
      expect(res.body.programId).toBeNull();
      expect(res.body.failureReason).toBeTruthy();
    });

    it("fails honestly when the AI's response can't be parsed at all", async () => {
      generateCompletion.mockResolvedValueOnce("I'm not sure, let me think about it.");

      const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("failed");
    });

    it("lets a failed plan be retried, and a subsequent success activates it in place (same version)", async () => {
      generateCompletion.mockResolvedValueOnce("garbage response");
      const failedRes = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(failedRes.body.status).toBe("failed");
      const failedVersion = failedRes.body.version;

      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Good fit after retry.`);
      const retryRes = await request(app)
        .post(`/plans/${failedRes.body.id}/retry`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send();

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.status).toBe("generated");
      expect(retryRes.body.version).toBe(failedVersion); // retry reuses the same row/version, doesn't mint a new one
      expect(retryRes.body.isActive).toBe(true);
    });

    it("rejects retrying a plan that isn't in a failed state", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Fine.`);
      const generated = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      const res = await request(app)
        .post(`/plans/${generated.body.id}/retry`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("plan_not_failed");
    });

    it("generating a new plan deactivates the previously active one — exactly one active plan at a time", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: First plan.`);
      const first = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(first.body.isActive).toBe(true);

      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programBId}\nRATIONALE: Second plan, different program.`);
      const second = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(second.body.isActive).toBe(true);
      expect(second.body.version).toBe(first.body.version + 1);

      const firstNow = await prisma.plan.findUnique({ where: { id: first.body.id } });
      expect(firstNow?.isActive).toBe(false);

      const current = await request(app).get("/plans/current").set("Authorization", `Bearer ${accessToken}`).send();
      expect(current.body.plan.id).toBe(second.body.id);
    });

    it("generates a real Recommendation grounded in the active plan, and accepting a switch creates a new active Plan", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Starting plan.`);
      const plan = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      const planVersion = plan.body.version;

      generateCompletion.mockResolvedValueOnce(
        `DECISION: ${programBId}\nRATIONALE: Recent activity suggests a program change would help.`,
      );
      const rec = await request(app)
        .post("/recommendations/generate")
        .set("Authorization", `Bearer ${accessToken}`)
        .send();

      expect(rec.status).toBe(201);
      expect(rec.body.kind).toBe("switch_program");
      expect(rec.body.status).toBe("active");
      expect(rec.body.suggestedProgramId).toBe(programBId);

      const decide = await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "accept" });

      expect(decide.status).toBe(200);
      expect(decide.body.status).toBe("accepted");
      expect(decide.body.decidedByRole).toBe("user");

      const current = await request(app).get("/plans/current").set("Authorization", `Bearer ${accessToken}`).send();
      expect(current.body.plan.programId).toBe(programBId);
      expect(current.body.plan.version).toBe(planVersion + 1);
    });

    it("a 'no_change' recommendation, when accepted, does not create a new Plan", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Starting plan.`);
      const plan = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      generateCompletion.mockResolvedValueOnce("DECISION: NO_CHANGE\nRATIONALE: Not enough data yet to justify a switch.");
      const rec = await request(app)
        .post("/recommendations/generate")
        .set("Authorization", `Bearer ${accessToken}`)
        .send();
      expect(rec.body.kind).toBe("no_change");
      expect(rec.body.suggestedProgramId).toBeNull();

      const decide = await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "accept" });
      expect(decide.body.status).toBe("no_change");

      const current = await request(app).get("/plans/current").set("Authorization", `Bearer ${accessToken}`).send();
      expect(current.body.plan.id).toBe(plan.body.id); // unchanged
      expect(current.body.plan.version).toBe(plan.body.version);
    });

    it("rejects deciding an already-decided recommendation", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Plan.`);
      await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      generateCompletion.mockResolvedValueOnce("DECISION: NO_CHANGE\nRATIONALE: Fine for now.");
      const rec = await request(app).post("/recommendations/generate").set("Authorization", `Bearer ${accessToken}`).send();

      await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "decline" });

      const secondDecision = await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "accept" });

      expect(secondDecision.status).toBe(409);
      expect(secondDecision.body.error.code).toBe("recommendation_already_decided");
    });

    it("requires a replacementProgramId for a 'modify' decision, and validates it against real programs", async () => {
      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Plan.`);
      await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      generateCompletion.mockResolvedValueOnce("DECISION: NO_CHANGE\nRATIONALE: Fine for now.");
      const rec = await request(app).post("/recommendations/generate").set("Authorization", `Bearer ${accessToken}`).send();

      const missingReplacement = await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "modify" });
      expect(missingReplacement.status).toBe(400);

      const bogusReplacement = await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "modify", replacementProgramId: "not-a-real-program" });
      expect(bogusReplacement.status).toBe(404);

      const realReplacement = await request(app)
        .post(`/recommendations/${rec.body.id}/decide`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "modify", replacementProgramId: programBId });
      expect(realReplacement.status).toBe(200);
      expect(realReplacement.body.status).toBe("modified");

      const current = await request(app).get("/plans/current").set("Authorization", `Bearer ${accessToken}`).send();
      expect(current.body.plan.programId).toBe(programBId);
    });

    // 18 Sep 2026 — Equipment/gym-context self-report is now real, honest
    // context the selection prompt reads (see plans.service.ts's
    // buildSelectionPrompt); this asserts the prompt text actually carries
    // it, not just that generation still succeeds.
    it("includes the user's real equipmentContext in the Plan-Generation selection prompt", async () => {
      await prisma.onboardingProfile.update({
        where: { userId },
        data: { equipmentContext: "home_bodyweight_only" },
      });

      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Fits a bodyweight-only setup.`);
      const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("generated");

      expect(generateCompletion).toHaveBeenCalledTimes(1);
      const promptSent = generateCompletion.mock.calls[0][0] as string;
      expect(promptSent).toContain("bodyweight only");

      // Reset for any tests that run after this one in the same file.
      await prisma.onboardingProfile.update({ where: { userId }, data: { equipmentContext: null } });
    });

    it("adds a cautious note when health data was skipped or the user is a minor", async () => {
      await prisma.onboardingProfile.update({ where: { userId }, data: { healthDataSkippedAt: new Date(), age: 16 } });

      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}
RATIONALE: Gentle fit.`);
      const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(res.status).toBe(201);

      const promptSent = generateCompletion.mock.calls[0][0] as string;
      expect(promptSent).toContain("UNKNOWN");
      expect(promptSent).toContain("under 18");

      await prisma.onboardingProfile.update({ where: { userId }, data: { healthDataSkippedAt: null, age: null } });
    });

    it("still generates cleanly when no equipmentContext was ever self-reported (never fabricates one)", async () => {
      await prisma.onboardingProfile.update({ where: { userId }, data: { equipmentContext: null } });

      generateCompletion.mockResolvedValueOnce(`PROGRAM_ID: ${programAId}\nRATIONALE: Fine without equipment context.`);
      const res = await request(app).post("/plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("generated");

      const promptSent = generateCompletion.mock.calls[0][0] as string;
      expect(promptSent).toContain("not specified");
    });
  });
});
