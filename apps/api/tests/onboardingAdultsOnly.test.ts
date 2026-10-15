import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * "Continue without health data" (onboarding/09) and the adults-only rule
 * (FynroX is 18+ only; there is no guardian flow). Real Postgres, no mocked Prisma.
 */
describe("Onboarding: health-data skip + adults only", () => {
  const app = buildApp();
  let userId: string;
  let token: string;

  const baseProfile = {
    gender: "female",
    age: 25,
    goals: ["general_fitness"],
    allergens: [],
    medicalConditions: [],
    injuries: [],
  };

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("skipadult"), password: "SomePassword1!", fullName: "Skip Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.onboardingProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("records healthDataSkippedAt, discards any submitted medical data, and raises no safety escalation", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseProfile, healthDataSkipped: true, medicalConditions: ["Asthma"], injuries: ["Knee"] });

    expect(res.status).toBe(200);
    expect(res.body.onboardingProfile.healthDataSkippedAt).not.toBeNull();
    expect(res.body.onboardingProfile.medicalConditions).toEqual([]);
    expect(res.body.onboardingProfile.injuries).toEqual([]);
    expect(await prisma.safetyEscalation.count({ where: { userId } })).toBe(0);
  });

  it("clears healthDataSkippedAt when a later submission answers normally", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseProfile, medicalConditions: ["Asthma"] });

    expect(res.status).toBe(200);
    expect(res.body.onboardingProfile.healthDataSkippedAt).toBeNull();
    expect(res.body.onboardingProfile.medicalConditions).toEqual(["Asthma"]);
  });

  it("rejects an under-18 date of birth with under_18_not_allowed", async () => {
    const now = new Date();
    const dob = `${now.getUTCFullYear() - 16}-01-15`;
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseProfile, age: undefined, dateOfBirth: dob });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("under_18_not_allowed");
  });

  it("rejects an under-18 legacy age with under_18_not_allowed", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseProfile, age: 17 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("under_18_not_allowed");
  });

  it("no longer exposes the guardian-review endpoints", async () => {
    const res = await request(app).get("/users/me/guardian-review").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
