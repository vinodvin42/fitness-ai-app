import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";

const app = buildApp();

/**
 * Acceptance test 14 (spec §11): "Gym and creator portal API responses
 * contain no health, nutrition-log, photo or AI-chat fields."
 * BR-GYM-003 / BR-CRT-002 say the same as rules: gyms see operational
 * aggregates only, creators see commercial aggregates only.
 *
 * This is the one acceptance test that was already TRUE of the codebase
 * and had nothing guarding it. That is the worst combination: correct
 * today, with no alarm when someone adds a convenient `user` include to
 * a portal endpoint six months from now. Hence a regression guard rather
 * than a new feature.
 *
 * The check is deliberately shape-based — it walks the whole response
 * body for forbidden KEYS, at any depth — rather than asserting an
 * expected response. An assertion on the expected shape passes happily
 * when a new leaked field is added alongside it.
 */

/** Keys that must never appear in a partner-facing response, at any depth. */
const FORBIDDEN_KEYS = [
  "medicalConditions",
  "injuries",
  "allergens",
  "weightKg",
  "heightCm",
  "bodyFatPercent",
  "mealLogs",
  "mealLog",
  "foodEstimate",
  "progressPhoto",
  "progressPhotos",
  "photoUrl",
  "aiCoachMessages",
  "aiCoachMessage",
  "recoveryLog",
  "restingHeartRate",
  "hrvMs",
  "sleepHours",
  "passwordHash",
];

function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findForbiddenKeys(v, `${path}[${i}]`));
  }
  const hits: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(k)) hits.push(`${path}.${k}`);
    hits.push(...findForbiddenKeys(v, `${path}.${k}`));
  }
  return hits;
}

describe("BR-GYM-003 / BR-CRT-002 — partner responses carry no member health data", () => {
  let gymToken: string;
  let gymId: string;
  let influencerToken: string;
  let influencerId: string;
  let memberId: string;
  const PORTAL_PASSWORD = "PortalPass123!";

  beforeAll(async () => {
    const suffix = uniqueSuffix();

    const gym = await prisma.gym.create({
      data: {
        name: `Isolation Fixture Gym ${suffix}`,
        status: "approved",
        contactName: "Isolation Fixture Owner",
        contactEmail: `gym-iso-${suffix}@example.com`,
        inviteCode: `ISO${suffix.slice(-6).toUpperCase()}`,
        gymPasswordHash: await hashPassword(PORTAL_PASSWORD),
      },
    });
    gymId = gym.id;
    await prisma.gymLocation.create({
      data: { gymId, name: "Main", address: "Kukatpally", equipment: "Racks, dumbbells" },
    });

    // A member with a full set of exactly the data that must not leak.
    const member = await prisma.user.create({
      data: {
        email: uniqueEmail("iso-member"),
        passwordHash: await hashPassword("unused"),
        fullName: "Isolation Fixture Member",
        referralCode: await generateUniqueReferralCode(),
        gymId,
      },
    });
    memberId = member.id;
    await prisma.onboardingProfile.create({
      data: {
        userId: memberId,
        medicalConditions: ["heart condition"],
        injuries: ["acl tear"],
        allergens: ["peanuts"],
        weightKg: 82,
        heightCm: 180,
        completedAt: new Date(),
      },
    });
    await prisma.bodyMeasurement.create({ data: { userId: memberId, weightKg: 82, bodyFatPercent: 18 } });
    await prisma.recoveryLog.create({
      data: { userId: memberId, date: new Date(), restingHeartRate: 52, sleepHours: 7.5, hrvMs: 60 },
    });

    const gymLogin = await request(app)
      .post("/gym-portal/auth/login")
      .send({ email: gym.contactEmail, password: PORTAL_PASSWORD });
    gymToken = gymLogin.body.token ?? gymLogin.body.accessToken;

    const influencer = await prisma.influencer.create({
      data: {
        name: `Isolation Fixture Creator ${suffix}`,
        email: `creator-iso-${suffix}@example.com`,
        commissionPct: 20,
        status: "active",
        passwordHash: await hashPassword(PORTAL_PASSWORD),
      },
    });
    influencerId = influencer.id;
    const infLogin = await request(app)
      .post("/influencers/auth/login")
      .send({ email: influencer.email, password: PORTAL_PASSWORD });
    influencerToken = infLogin.body.tokens?.accessToken;
  });

  afterAll(async () => {
    await prisma.recoveryLog.deleteMany({ where: { userId: memberId } });
    await prisma.bodyMeasurement.deleteMany({ where: { userId: memberId } });
    await prisma.onboardingProfile.deleteMany({ where: { userId: memberId } });
    await prisma.user.deleteMany({ where: { id: memberId } });
    await prisma.gymLocation.deleteMany({ where: { gymId } });
    await prisma.gym.deleteMany({ where: { id: gymId } });
    await prisma.influencer.deleteMany({ where: { id: influencerId } });
  });

  it("signs the fixture partners in, so the assertions below are real responses", () => {
    expect(gymToken).toBeTruthy();
    expect(influencerToken).toBeTruthy();
  });

  const gymEndpoints = ["/gym-portal/me", "/gym-portal/member-activation-summary"];
  for (const path of gymEndpoints) {
    it(`GET ${path} leaks no member health, nutrition, photo or AI field`, async () => {
      const res = await request(app).get(path).set("Authorization", `Bearer ${gymToken}`);
      expect(res.status).toBe(200);
      expect(findForbiddenKeys(res.body)).toEqual([]);
      // The member exists and is counted, so this is a real isolation
      // check rather than an empty response trivially passing.
      expect(JSON.stringify(res.body).length).toBeGreaterThan(2);
    });
  }

  it("the gym response never contains the member's name or email either", async () => {
    const res = await request(app).get("/gym-portal/me").set("Authorization", `Bearer ${gymToken}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("Isolation Fixture Member");
    expect(body).not.toContain("heart condition");
  });

  it("the creator portal returns commercial aggregates with no member data", async () => {
    const res = await request(app).get("/influencer-portal/me").set("Authorization", `Bearer ${influencerToken}`);
    expect(res.status).toBe(200);
    expect(findForbiddenKeys(res.body)).toEqual([]);
  });

  it("the key-walker itself catches a leak, so a green run means something", () => {
    // Guards the guard: if findForbiddenKeys silently stopped matching,
    // every assertion above would pass vacuously.
    const leaky = { gym: { members: [{ id: "1", onboarding: { medicalConditions: ["asthma"] } }] } };
    expect(findForbiddenKeys(leaky)).toEqual(["$.gym.members[0].onboarding.medicalConditions"]);
  });
});
