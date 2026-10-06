import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

describe("Form analysis coach review", () => {
  const app = buildApp();
  let userId: string;
  let userToken: string;
  let otherUserId: string;
  let proA: { id: string; token: string };
  let proB: { id: string; token: string };
  let subId: string;
  let otherSubId: string;
  const VIDEO = "data:video/mp4;base64,AAAA";

  async function mkPro(label: string) {
    const p = await prisma.professional.create({
      data: {
        email: `fa-${label}-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `FA ${label}`,
        status: "active",
      },
    });
    return { id: p.id, token: signProfessionalAccessToken({ sub: p.id, email: p.email }).token };
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const s = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("fa-user"), password: "SomePassword1!", fullName: "Riya Sharma" });
    userId = s.body.user.id;
    userToken = s.body.tokens.accessToken;
    const s2 = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("fa-user2"), password: "SomePassword1!", fullName: "Other Person" });
    otherUserId = s2.body.user.id;
    proA = await mkPro("a");
    proB = await mkPro("b");
    await prisma.relationship.create({
      data: { userId, professionalId: proA.id, serviceType: "fitness", status: "active" },
    });
    await prisma.relationship.create({
      data: { userId: otherUserId, professionalId: proB.id, serviceType: "fitness", status: "active" },
    });
    subId = (await prisma.formAnalysisSubmission.create({ data: { userId, videoUrl: VIDEO } })).id;
    otherSubId = (await prisma.formAnalysisSubmission.create({ data: { userId: otherUserId, videoUrl: VIDEO } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.professional.deleteMany({ where: { id: { in: [proA.id, proB.id] } } });
  });

  it("requires professional auth", async () => {
    expect((await request(app).get("/professionals/me/form-analysis")).status).toBe(401);
  });

  it("lists only active clients' submissions, without video payload", async () => {
    const res = await request(app).get("/professionals/me/form-analysis").set(auth(proA.token));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(subId);
    expect(ids).not.toContain(otherSubId);
    const item = res.body.items.find((i: { id: string }) => i.id === subId);
    expect(item.videoUrl).toBeNull();
    expect(item.hasVideo).toBe(true);
    expect(item.userFirstName).toBe("Riya");
  });

  it("detail includes video; other professional's client and unknown ids 404", async () => {
    const ok = await request(app).get(`/professionals/me/form-analysis/${subId}`).set(auth(proA.token));
    expect(ok.status).toBe(200);
    expect(ok.body.videoUrl).toBe(VIDEO);
    expect((await request(app).get(`/professionals/me/form-analysis/${subId}`).set(auth(proB.token))).status).toBe(404);
    expect((await request(app).get(`/professionals/me/form-analysis/${otherSubId}`).set(auth(proA.token))).status).toBe(404);
    expect((await request(app).get(`/professionals/me/form-analysis/nope`).set(auth(proA.token))).status).toBe(404);
  });

  it("ended relationship hides the submission", async () => {
    const rel = await prisma.relationship.create({
      data: { userId, professionalId: proB.id, serviceType: "nutrition", status: "ended" },
    });
    expect((await request(app).get(`/professionals/me/form-analysis/${subId}`).set(auth(proB.token))).status).toBe(404);
    await prisma.relationship.delete({ where: { id: rel.id } });
  });

  it("validates note and 404s review for non-clients", async () => {
    const bad = await request(app).post(`/professionals/me/form-analysis/${subId}/review`).set(auth(proA.token)).send({ coachNote: "  " });
    expect(bad.status).toBe(400);
    const nf = await request(app).post(`/professionals/me/form-analysis/${subId}/review`).set(auth(proB.token)).send({ coachNote: "Hi" });
    expect(nf.status).toBe(404);
  });

  it("review flow: marks reviewed, notifies user, user sees note", async () => {
    const res = await request(app)
      .post(`/professionals/me/form-analysis/${subId}/review`)
      .set(auth(proA.token))
      .send({ coachNote: "Keep your chest up." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("reviewed");
    expect(res.body.reviewedAt).toBeTruthy();
    const row = await prisma.formAnalysisSubmission.findUnique({ where: { id: subId } });
    expect(row?.reviewedByProfessionalId).toBe(proA.id);
    const notes = await prisma.notification.findMany({ where: { userId, kind: "coach" } });
    expect(notes.length).toBe(1);
    const mine = await request(app).get("/form-analysis").set(auth(userToken));
    const item = mine.body.items.find((i: { id: string }) => i.id === subId);
    expect(item.coachNote).toBe("Keep your chest up.");
    expect(item.reviewedAt).toBeTruthy();
  });

  it("same professional may re-review; another professional (also active) gets 409", async () => {
    const again = await request(app).post(`/professionals/me/form-analysis/${subId}/review`).set(auth(proA.token)).send({ coachNote: "Updated" });
    expect(again.status).toBe(200);
    expect(again.body.coachNote).toBe("Updated");
    const rel = await prisma.relationship.create({
      data: { userId, professionalId: proB.id, serviceType: "nutrition", status: "active" },
    });
    const other = await request(app).post(`/professionals/me/form-analysis/${subId}/review`).set(auth(proB.token)).send({ coachNote: "Nope" });
    expect(other.status).toBe(409);
    await prisma.relationship.delete({ where: { id: rel.id } });
  });
});
