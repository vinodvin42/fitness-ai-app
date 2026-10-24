import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Health answers and preferences after setup (24 Oct 2026): Figma
 * today/safer-plan-sheet ("Make your plan safer" for members who skipped
 * health data), the setup checklist's "Food preferences", and the first
 * workout setting the training level. Same consent and D14 rules as
 * onboarding (tests/safetyEscalations.test.ts).
 *
 * Rate limits: 1 consumer signup.
 */
describe("Health answers and preferences after setup", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const health = (body: object) => request(app).put("/users/me/onboarding/health").set(auth()).send(body);
  const escalations = () => prisma.safetyEscalation.findMany({ where: { userId } });

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("health-after"), password: "SomePassword1!", fullName: "Health After" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
    const setup = await request(app)
      .put("/users/me/onboarding")
      .set(auth())
      .send({ goals: ["lose_fat"], trainingLevel: "beginner", allergens: [], medicalConditions: [], injuries: [], healthDataSkipped: true });
    expect(setup.status).toBe(200);
  });

  afterAll(async () => {
    const rows = await escalations();
    await prisma.adminActionItem.deleteMany({ where: { entityType: "SafetyEscalation", entityId: { in: rows.map((r) => r.id) } } });
    await prisma.analyticsEvent.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("H1 without consent nothing is kept and the member stays 'skipped'", async () => {
    const res = await health({ medicalConditions: ["Asthma"], injuries: ["Knees"], healthDataConsent: false });
    expect(res.status).toBe(200);
    expect(res.body.onboardingProfile.medicalConditions).toEqual([]);
    expect(res.body.onboardingProfile.injuries).toEqual([]);
    expect(res.body.onboardingProfile.healthDataSkippedAt).not.toBeNull();
    expect(await escalations()).toHaveLength(0);
  });

  it("H2 with consent the answers are stored, 'skipped' clears, and a new condition is a warning", async () => {
    const res = await health({ medicalConditions: ["Asthma"], injuries: ["Knees"], healthDataConsent: true });
    expect(res.status).toBe(200);
    expect(res.body.safetyOutcome).toBe("warning");
    expect(res.body.onboardingProfile.medicalConditions).toEqual(["Asthma"]);
    expect(res.body.onboardingProfile.injuries).toEqual(["Knees"]);
    expect(res.body.onboardingProfile.healthDataSkippedAt).toBeNull();
    const consent = await prisma.consent.findFirst({ where: { userId, type: "health_data_processing" }, orderBy: { createdAt: "desc" } });
    expect(consent?.granted).toBe(true);
    const rows = await escalations();
    expect(rows).toHaveLength(1);
    const item = await prisma.adminActionItem.findFirst({ where: { entityType: "SafetyEscalation", entityId: rows[0].id } });
    expect(item?.severity).toBe("low");
  });

  it("H3 saving the same answers again doesn't escalate again; a newly added heart condition pauses", async () => {
    expect((await health({ medicalConditions: ["Asthma"], injuries: ["Knees"], healthDataConsent: true })).body.safetyOutcome).toBe("none");
    expect(await escalations()).toHaveLength(1);
    const res = await health({ medicalConditions: ["Asthma", "Heart Condition"], injuries: ["Knees"], healthDataConsent: true });
    expect(res.body.safetyOutcome).toBe("pause");
    const rows = await escalations();
    expect(rows).toHaveLength(2);
    const severities = await prisma.adminActionItem.findMany({ where: { entityType: "SafetyEscalation", entityId: { in: rows.map((r) => r.id) } } });
    expect(severities.map((s) => s.severity).sort()).toEqual(["high", "low"]);
  });

  it("H4 'None' is an answer, not a condition, needs no consent, and the body is validated", async () => {
    await prisma.onboardingProfile.update({ where: { userId }, data: { healthDataSkippedAt: new Date() } });
    const res = await health({ medicalConditions: ["None"], injuries: [], healthDataConsent: false });
    expect(res.body.onboardingProfile.medicalConditions).toEqual([]);
    expect(res.body.onboardingProfile.healthDataSkippedAt).toBeNull();
    expect((await health({ medicalConditions: ["Asthma"] })).status).toBe(400);
  });

  it("H5 food preferences and training level are editable after setup", async () => {
    const res = await request(app)
      .patch("/users/me/onboarding")
      .set(auth())
      .send({ dietType: "Vegetarian", allergens: ["Peanuts", "None"], trainingLevel: "intermediate" });
    expect(res.status).toBe(200);
    expect(res.body.onboardingProfile).toMatchObject({ dietType: "Vegetarian", allergens: ["Peanuts"], trainingLevel: "intermediate" });
    expect((await request(app).patch("/users/me/onboarding").set(auth()).send({ trainingLevel: "expert" })).status).toBe(400);
  });
});
