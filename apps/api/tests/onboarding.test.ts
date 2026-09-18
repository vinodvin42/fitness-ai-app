import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Onboarding wizard's 3 real, previously-incomplete data points (R1
 * Developer 1, 18 Sep 2026 — see docs/mobile/07-open-questions-gaps.md
 * §54): Availability/Schedule, broader Baseline/measurements, and
 * Equipment/gym-context self-report. Real Postgres-backed integration
 * tests, same "no mocked Prisma/Express" discipline as the rest of this
 * directory — only PUT /users/me/onboarding is exercised here; the
 * equipment-aware Plan-Generation prompt change gets its own coverage in
 * plans.test.ts (mocked aiClient, per that file's own established
 * pattern).
 */
describe("Onboarding: Schedule / Equipment / Baseline measurements", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("onboarding");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Onboarding Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.bodyMeasurement.deleteMany({ where: { userId } });
    await prisma.onboardingProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("persists real Schedule and Equipment fields onto OnboardingProfile", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        gender: "female",
        age: 29,
        weightKg: 63,
        heightCm: 168,
        goals: ["build_muscle"],
        trainingLevel: "intermediate",
        dietType: "Vegetarian",
        allergens: [],
        medicalConditions: [],
        injuries: [],
        trainingDaysPerWeek: 4,
        preferredTrainingDays: ["mon", "wed", "fri", "sat"],
        sessionLengthMinutes: 45,
        equipmentContext: "home_dumbbells_bands",
      });

    expect(res.status).toBe(200);
    expect(res.body.onboardingProfile.trainingDaysPerWeek).toBe(4);
    expect(res.body.onboardingProfile.preferredTrainingDays).toEqual(["mon", "wed", "fri", "sat"]);
    expect(res.body.onboardingProfile.sessionLengthMinutes).toBe(45);
    expect(res.body.onboardingProfile.equipmentContext).toBe("home_dumbbells_bands");

    // Real DB read, not just trusting the 200 response.
    const dbProfile = await prisma.onboardingProfile.findUnique({ where: { userId } });
    expect(dbProfile?.trainingDaysPerWeek).toBe(4);
    expect(dbProfile?.preferredTrainingDays).toEqual(["mon", "wed", "fri", "sat"]);
    expect(dbProfile?.sessionLengthMinutes).toBe(45);
    expect(dbProfile?.equipmentContext).toBe("home_dumbbells_bands");
    expect(dbProfile?.completedAt).not.toBeNull();
  });

  it("rejects an invalid equipmentContext / preferredTrainingDays value (not a fabricated fallback)", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        goals: [],
        allergens: [],
        medicalConditions: [],
        injuries: [],
        equipmentContext: "a_private_gym_membership",
      });
    expect(res.status).toBe(400);

    const badDay = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        goals: [],
        allergens: [],
        medicalConditions: [],
        injuries: [],
        preferredTrainingDays: ["someday"],
      });
    expect(badDay.status).toBe(400);
  });

  it("writes a real BodyMeasurement baseline row when body-fat%/waist/hips are submitted, distinct from OnboardingProfile", async () => {
    const before = await prisma.bodyMeasurement.count({ where: { userId } });

    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        weightKg: 63.5,
        goals: [],
        allergens: [],
        medicalConditions: [],
        injuries: [],
        bodyFatPercent: 24.5,
        waistCm: 74,
        hipsCm: 96,
      });
    expect(res.status).toBe(200);

    // bodyFatPercent/waistCm/hipsCm are NOT OnboardingProfile fields.
    expect(res.body.onboardingProfile.bodyFatPercent).toBeUndefined();
    expect(res.body.onboardingProfile.waistCm).toBeUndefined();

    const after = await prisma.bodyMeasurement.count({ where: { userId } });
    expect(after).toBe(before + 1);

    const baseline = await prisma.bodyMeasurement.findFirst({
      where: { userId },
      orderBy: { loggedAt: "desc" },
    });
    expect(baseline?.bodyFatPercent).toBe(24.5);
    expect(baseline?.waistCm).toBe(74);
    expect(baseline?.hipsCm).toBe(96);
    expect(baseline?.weightKg).toBe(63.5);
  });

  it("doesn't create a BodyMeasurement row when no baseline/weight value is submitted", async () => {
    const email = uniqueEmail("onboarding-nobaseline");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "No Baseline Tester" });
    const noBaselineUserId = signupRes.body.user.id;
    const noBaselineToken = signupRes.body.tokens.accessToken;

    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${noBaselineToken}`)
      .send({ goals: [], allergens: [], medicalConditions: [], injuries: [] });
    expect(res.status).toBe(200);

    const count = await prisma.bodyMeasurement.count({ where: { userId: noBaselineUserId } });
    expect(count).toBe(0);

    await prisma.onboardingProfile.deleteMany({ where: { userId: noBaselineUserId } });
    await prisma.user.deleteMany({ where: { id: noBaselineUserId } });
  });
});
