import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * "Continue without health data" (onboarding/09) and Under-18 guardian
 * review (onboarding/11). Real Postgres, no mocked Prisma. Guardian approval
 * is deliberately not implemented, so only submit/read/validation is tested.
 */
describe("Onboarding: health-data skip + guardian review", () => {
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
      .send({ email: uniqueEmail("skipguardian"), password: "SomePassword1!", fullName: "Skip Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.guardianReview.deleteMany({ where: { userId } });
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

  it("GET /users/me/guardian-review is null before any submission", async () => {
    const res = await request(app).get("/users/me/guardian-review").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.guardianReview).toBeNull();
  });

  it("POST /users/me/guardian-review stores a pending review and is idempotent per user", async () => {
    const res = await request(app)
      .post("/users/me/guardian-review")
      .set("Authorization", `Bearer ${token}`)
      .send({ guardianName: "Pat Parent", guardianEmail: "Pat@Example.com", relationship: "parent" });

    expect(res.status).toBe(201);
    expect(res.body.guardianReview).toEqual(
      expect.objectContaining({ guardianName: "Pat Parent", guardianEmail: "pat@example.com", status: "pending" }),
    );

    const again = await request(app)
      .post("/users/me/guardian-review")
      .set("Authorization", `Bearer ${token}`)
      .send({ guardianName: "Pat P.", guardianEmail: "pat@example.com", relationship: "legal_guardian" });
    expect(again.status).toBe(201);
    expect(await prisma.guardianReview.count({ where: { userId } })).toBe(1);

    const got = await request(app).get("/users/me/guardian-review").set("Authorization", `Bearer ${token}`);
    expect(got.body.guardianReview.relationship).toBe("legal_guardian");
  });

  it("rejects an invalid guardian email and unauthenticated calls", async () => {
    const bad = await request(app)
      .post("/users/me/guardian-review")
      .set("Authorization", `Bearer ${token}`)
      .send({ guardianName: "X", guardianEmail: "nope", relationship: "parent" });
    expect(bad.status).toBe(400);

    const anon = await request(app).get("/users/me/guardian-review");
    expect(anon.status).toBe(401);
  });
});
