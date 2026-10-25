import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { getProfessionalDetail } from "../src/modules/coaching/coaching.service";
import { professionalPublicId } from "../src/lib/professionalCode";

/**
 * Professional profile as members see it (owner, 25 Oct 2026: show ID, photo, open times, active
 * status, experience and certifications). The coach sets the photo; members read it. Certifications
 * are the verified, unexpired ones and never carry the uploaded documents.
 *
 * Rate limits: 1 consumer signup.
 */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const CODE = /^FXP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

describe("Professional profile for members", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let professionalId: string;
  let fullCoachId: string;
  let coachToken: string;
  let offeringId: string;
  const member = () => ({ Authorization: `Bearer ${token}` });
  const coach = () => ({ Authorization: `Bearer ${coachToken}` });

  const makeCoach = async (tag: string, extra: Record<string, unknown> = {}) =>
    prisma.professional.create({
      data: {
        email: `profile-${tag}-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Profile Coach ${tag}`,
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 15,
        yearsExperience: 6,
        ...extra,
      },
    });

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("pro-profile"), password: "ProfilePassword1!", fullName: "Profile Member" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;

    const c1 = await makeCoach("one");
    professionalId = c1.id;
    coachToken = signProfessionalAccessToken({ sub: c1.id, email: c1.email }).token;
    await prisma.professionalCredential.create({
      data: {
        professionalId,
        serviceType: "fitness",
        status: "verified",
        certificationName: "Certified Personal Trainer",
        certifyingBody: "Test Fitness Council",
        yearObtained: 2019,
        certificationDocData: "data:image/png;base64,SECRET-DOCUMENT",
        qualificationDocData: "data:image/png;base64,SECRET-QUALIFICATION",
      },
    });
    // Verified but expired: not shown.
    await prisma.professionalCredential.create({
      data: {
        professionalId,
        serviceType: "nutrition",
        status: "verified",
        certificationName: "Expired Nutrition Cert",
        certifyingBody: "Old Board",
        yearObtained: 2010,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    const pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 1500, durationMinutes: 60, label: "Profile Session" });
    offeringId = pricing.offering.id;

    // A coach at their client limit (1 of 1), with only a pending certification.
    const c2 = await makeCoach("full", { maxActiveClients: 1 });
    fullCoachId = c2.id;
    await prisma.professionalCredential.create({
      data: { professionalId: fullCoachId, serviceType: "fitness", status: "pending", certificationName: "Pending Cert", certifyingBody: "Board" },
    });
    await prisma.relationship.create({ data: { userId, professionalId: fullCoachId, serviceType: "fitness", status: "active" } });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { professionalId: { in: [professionalId, fullCoachId] } } });
  });

  it("PP1 gives each professional a stable public ID, the same in the list and on the profile", async () => {
    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set(member());
    expect(detail.status).toBe(200);
    expect(detail.body.publicId).toMatch(CODE);
    expect(detail.body.publicId).toBe(professionalPublicId(professionalId));
    expect(professionalPublicId(fullCoachId)).not.toBe(detail.body.publicId);
    expect(detail.body.status).toBe("active");
    expect(detail.body.yearsExperience).toBe(6);

    const list = await request(app).get("/coaching/professionals").set(member());
    const row = list.body.items.find((i: { id: string }) => i.id === professionalId);
    expect(row.publicId).toBe(detail.body.publicId);
  });

  it("PP2 shows verified, unexpired certifications by name, issuer and year, never the documents", async () => {
    const res = await request(app).get(`/coaching/professionals/${professionalId}`).set(member());
    expect(res.body.certifications).toEqual([
      { serviceType: "fitness", name: "Certified Personal Trainer", issuedBy: "Test Fitness Council", year: 2019, validUntil: null },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("SECRET");

    const pending = await request(app).get(`/coaching/professionals/${fullCoachId}`).set(member());
    expect(pending.body.certifications).toEqual([]);
  });

  it("PP3 says whether the professional is below their client limit", async () => {
    const open = await request(app).get(`/coaching/professionals/${professionalId}`).set(member());
    expect(open.body.acceptingNewClients).toBe(true);
    const full = await request(app).get(`/coaching/professionals/${fullCoachId}`).set(member());
    expect(full.body.acceptingNewClients).toBe(false);
    expect(full.body.totalClients).toBe(1);
  });

  it("PP4 lists a week of open times on the hourly grid, minus booked ones, and counts past sessions", async () => {
    // A fixed "now": 08:00 UTC on a day 30 days ahead, so every grid time that day is still to come.
    const day = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const now = new Date(dayStart + 8 * 60 * 60 * 1000);
    const at = (h: number, dayOffset = 0) => new Date(dayStart + dayOffset * 24 * 60 * 60 * 1000 + h * 60 * 60 * 1000);
    const base = { userId, professionalId, offeringId, durationMinutes: 60, priceCents: 1500, commissionPct: 20 };
    await prisma.booking.createMany({
      data: [
        { ...base, scheduledAt: at(10), status: "confirmed" },
        { ...base, scheduledAt: at(11), status: "cancelled" },
        { ...base, scheduledAt: at(9, -2), status: "confirmed" },
        { ...base, scheduledAt: at(12, -3), status: "cancelled" },
      ],
    });

    const detail = await getProfessionalDetail(professionalId, now);
    expect(detail.openTimes).toHaveLength(7);
    expect(detail.openTimes[0].date).toBe(new Date(dayStart).toISOString().slice(0, 10));
    const first = detail.openTimes[0].times;
    expect(first).toHaveLength(8); // 9:00-17:00 is 9 times; 10:00 is booked, the cancelled 11:00 is free
    expect(first).not.toContain(at(10).toISOString());
    expect(first).toContain(at(11).toISOString());
    expect(first[0]).toBe(at(9).toISOString());
    expect(detail.openTimes[6].times).toHaveLength(9);
    expect(detail.pastSessions).toBe(1);
    expect(new Date(detail.joinedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("PP5 the coach sets, replaces and removes their photo; members see it and its version", async () => {
    const none = await request(app).get(`/coaching/professionals/${professionalId}/photo`).set(member());
    expect(none.status).toBe(200);
    expect(none.body.photo).toBeNull();
    expect((await request(app).get(`/coaching/professionals/${professionalId}`).set(member())).body.photoVersion).toBeNull();

    const put = await request(app).put("/professionals/me/photo").set(coach()).send({ imageData: PNG });
    expect(put.status).toBe(200);
    expect(put.body.photo.imageData).toBe(PNG);

    const seen = await request(app).get(`/coaching/professionals/${professionalId}/photo`).set(member());
    expect(seen.body.photo.imageData).toBe(PNG);
    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set(member());
    expect(detail.body.photoVersion).toBe(put.body.photo.updatedAt);
    const list = await request(app).get("/coaching/professionals").set(member());
    expect(list.body.items.find((i: { id: string }) => i.id === professionalId).photoVersion).toBe(put.body.photo.updatedAt);

    const mine = await request(app).get("/professionals/me/photo").set(coach());
    expect(mine.body.photo.imageData).toBe(PNG);

    const del = await request(app).delete("/professionals/me/photo").set(coach());
    expect(del.status).toBe(204);
    expect((await request(app).get(`/coaching/professionals/${professionalId}/photo`).set(member())).body.photo).toBeNull();
  });

  it("PP6 refuses a file that isn't a JPEG or PNG, and anyone who isn't the signed-in coach", async () => {
    const fake = await request(app)
      .put("/professionals/me/photo")
      .set(coach())
      .send({ imageData: `data:image/png;base64,${Buffer.from("not really a png at all").toString("base64")}` });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe("invalid_image");

    expect((await request(app).put("/professionals/me/photo").send({ imageData: PNG })).status).toBe(401);
    // A member token isn't a coach token.
    expect((await request(app).put("/professionals/me/photo").set(member()).send({ imageData: PNG })).status).toBe(401);
    expect((await request(app).get(`/coaching/professionals/${professionalId}/photo`)).status).toBe(401);
  });

  it("PP8 the coach picks the languages they coach in; members see them and can filter by one", async () => {
    const set = await request(app).patch("/professionals/me/languages").set(coach()).send({ languages: ["ta", "en", "ta"] });
    expect(set.status).toBe(200);
    // Duplicates dropped, kept in the list's order.
    expect(set.body.languages).toEqual(["en", "ta"]);
    expect((await request(app).get("/professionals/me").set(coach())).body.professional.languages).toEqual(["en", "ta"]);

    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set(member());
    expect(detail.body.languages).toEqual(["en", "ta"]);

    const tamil = await request(app).get("/coaching/professionals").query({ language: "ta" }).set(member());
    expect(tamil.status).toBe(200);
    const tamilRow = tamil.body.items.find((i: { id: string }) => i.id === professionalId);
    expect(tamilRow.languages).toEqual(["en", "ta"]);
    const hindi = await request(app).get("/coaching/professionals").query({ language: "hi" }).set(member());
    expect(hindi.body.items.some((i: { id: string }) => i.id === professionalId)).toBe(false);
    expect((await request(app).get("/coaching/professionals").query({ language: "xx" }).set(member())).status).toBe(400);

    expect((await request(app).patch("/professionals/me/languages").set(coach()).send({ languages: ["klingon"] })).status).toBe(400);
    expect((await request(app).patch("/professionals/me/languages").set(member()).send({ languages: ["en"] })).status).toBe(401);
    const cleared = await request(app).patch("/professionals/me/languages").set(coach()).send({ languages: [] });
    expect(cleared.body.languages).toEqual([]);
  });

  it("PP7 a suspended professional's profile and photo are not shown", async () => {
    const c = await makeCoach("suspended", { status: "suspended" });
    expect((await request(app).get(`/coaching/professionals/${c.id}`).set(member())).status).toBe(404);
    expect((await request(app).get(`/coaching/professionals/${c.id}/photo`).set(member())).status).toBe(404);
  });
});
