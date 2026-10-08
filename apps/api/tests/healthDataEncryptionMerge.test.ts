import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { inflateRawSync } from "node:zlib";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { decryptStringList } from "../src/lib/fieldCrypto";

const app = buildApp();

function unzip(zip: Buffer): Record<string, string> {
  const eocd = zip.length - 22;
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(p + 10);
    const csize = zip.readUInt32LE(p + 20);
    const nlen = zip.readUInt16LE(p + 28);
    const off = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const dataStart = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28);
    const raw = zip.subarray(dataStart, dataStart + csize);
    out[name] = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
    p += 46 + nlen;
  }
  return out;
}

/**
 * Health data stays encrypted at rest across the onboarding changes layered on
 * top of the encryption (skip flag, "none" filtering) and the user-facing data
 * export: no plaintext in the columns, no ciphertext in responses or exports.
 */
describe("Health data encryption x onboarding skip / ZIP export", () => {
  let token: string;
  let userId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const profile = { gender: "female", age: 30, goals: ["general_fitness"], allergens: [] as string[] };

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("hdenc-merge"), password: "SomePassword1!", fullName: "Enc Merge" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.userDataExport.deleteMany({ where: { userId } });
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.onboardingProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stores declared conditions only encrypted, filters 'none', and returns decrypted values", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set(auth())
      .send({ ...profile, medicalConditions: ["mild asthma", "None"], injuries: ["left knee sprain"] });
    expect(res.status).toBe(200);
    expect(res.body.onboardingProfile.medicalConditions).toEqual(["mild asthma"]);
    expect(res.body.onboardingProfile).not.toHaveProperty("medicalConditionsEnc");

    const row = await prisma.onboardingProfile.findUniqueOrThrow({ where: { userId } });
    expect(row.medicalConditions).toEqual([]);
    expect(row.injuries).toEqual([]);
    expect(row.medicalConditionsEnc).not.toContain("asthma");
    expect(decryptStringList(row.medicalConditionsEnc)).toEqual(["mild asthma"]);
    expect(decryptStringList(row.injuriesEnc)).toEqual(["left knee sprain"]);
  });

  it("skipping health data stores nothing for conditions/injuries, plaintext or encrypted", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set(auth())
      .send({ ...profile, healthDataSkipped: true, medicalConditions: ["mild asthma"], injuries: ["left knee sprain"] });
    expect(res.status).toBe(200);
    const row = await prisma.onboardingProfile.findUniqueOrThrow({ where: { userId } });
    expect(row.healthDataSkippedAt).not.toBeNull();
    expect(row.medicalConditions).toEqual([]);
    expect(decryptStringList(row.medicalConditionsEnc)).toEqual([]);
    expect(decryptStringList(row.injuriesEnc)).toEqual([]);
  });

  it("the ZIP export carries decrypted health fields and never the *Enc ciphertext columns", async () => {
    await request(app)
      .put("/users/me/onboarding")
      .set(auth())
      .send({ ...profile, medicalConditions: ["mild asthma"], injuries: [] });
    const row = await prisma.onboardingProfile.findUniqueOrThrow({ where: { userId } });

    const created = await request(app).post("/users/me/exports").set(auth());
    expect(created.status).toBe(201);
    const dl = await request(app)
      .get(`/users/me/exports/${created.body.id}/download`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    const files = unzip(dl.body as Buffer);
    const summary = files["summary.pdf"];
    expect(summary).toContain("medicalConditions: mild asthma");
    expect(summary).not.toContain("medicalConditionsEnc");
    expect(summary).not.toContain("injuriesEnc");
    for (const content of Object.values(files)) {
      expect(content).not.toContain(row.medicalConditionsEnc as string);
    }
  });
});
