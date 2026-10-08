import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { decryptStringList, encryptField, encryptStringList, readHealthList } from "../src/lib/fieldCrypto";
import { getDecryptedOnboardingProfile } from "../src/lib/healthData";

const app = buildApp();

/**
 * Spec §10, "Health data (decision #3)": "Stored encrypted, separate
 * consent record, never exposed to gyms, creators or unrelated staff
 * roles."
 *
 * The consent record and the access rules were already real. Encryption
 * was not — medicalConditions and injuries were plain text columns,
 * readable in every backup and in any query a support engineer happened
 * to run.
 */
describe("Health data encrypted at rest (§10)", () => {
  let token: string;
  let userId: string;
  const CONDITIONS = ["diagnosed heart condition", "mild asthma"];
  const INJURIES = ["left acl reconstruction 2024"];

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("health-enc"), password: "Testpass123!", fullName: "Health Enc Probe" });
    expect(signup.status).toBe(201);
    token = signup.body.tokens.accessToken;
    userId = signup.body.user.id;

    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({
        goals: ["strength"],
        trainingLevel: "beginner",
        medicalConditions: CONDITIONS,
        injuries: INJURIES,
      });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "SafetyEscalation" } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("never leaves the declared conditions readable in the row", async () => {
    // The assertion that actually matters: a database dump of this table
    // must not contain the words the user typed.
    const raw = await prisma.onboardingProfile.findUnique({ where: { userId } });
    expect(raw!.medicalConditions).toEqual([]);
    expect(raw!.injuries).toEqual([]);

    const blob = JSON.stringify(raw);
    expect(blob).not.toContain("heart condition");
    expect(blob).not.toContain("asthma");
    expect(blob).not.toContain("acl reconstruction");
  });

  it("round-trips through the shared accessor", async () => {
    const profile = await getDecryptedOnboardingProfile(userId);
    expect(profile!.medicalConditions).toEqual(CONDITIONS);
    expect(profile!.injuries).toEqual(INJURIES);
    // The ciphertext columns are storage detail and must not ride along
    // on a DTO — that is how ciphertext ends up in a log.
    expect(profile).not.toHaveProperty("medicalConditionsEnc");
  });

  it("returns the real values to the user who declared them", async () => {
    const res = await request(app).get("/users/me/onboarding").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain("heart condition");
    // ...and not the ciphertext alongside it.
    expect(res.body.onboardingProfile?.medicalConditionsEnc ?? res.body.medicalConditionsEnc).toBeUndefined();
  });

  it("includes the real values in the user's own data export", async () => {
    const res = await request(app).get("/users/me/export").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // A DSAR export of ciphertext would satisfy nobody's rights.
    expect(JSON.stringify(res.body.onboardingProfile)).toContain("heart condition");
  });

  describe("the primitives", () => {
    it("produces different ciphertext for the same plaintext each time", () => {
      // A fresh IV per write — otherwise equal conditions across users
      // would be matchable by anyone with table access.
      expect(encryptField("asthma")).not.toBe(encryptField("asthma"));
    });

    it("encrypts a list as one blob, so the COUNT does not leak", () => {
      const one = encryptStringList(["a"]);
      const four = encryptStringList(["a", "b", "c", "d"]);
      // Not a length assertion — a single blob's length still varies with
      // content. The point is that there is ONE value, not N, so nothing
      // can be counted by row.
      expect(typeof one).toBe("string");
      expect(typeof four).toBe("string");
      expect(decryptStringList(four)).toEqual(["a", "b", "c", "d"]);
    });

    it("treats nothing-declared as null rather than an empty blob", () => {
      expect(encryptStringList([])).toBeNull();
      expect(decryptStringList(null)).toEqual([]);
    });

    it("throws rather than silently returning an empty list on corruption", () => {
      // This is the important failure mode: quietly returning [] would
      // tell a plan generator that someone with a heart condition
      // declared nothing.
      expect(() => decryptStringList("not:valid:ciphertext")).toThrow();
    });

    it("falls back to plaintext only while the backfill has not run", () => {
      expect(readHealthList({ encrypted: null, plaintext: ["legacy row"] })).toEqual(["legacy row"]);
      // Encrypted always wins when both are present.
      expect(
        readHealthList({ encrypted: encryptStringList(["real"]), plaintext: ["stale"] }),
      ).toEqual(["real"]);
    });
  });
});
