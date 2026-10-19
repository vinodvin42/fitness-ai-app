import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/** Exercise video (Oct 2026): admin sets/clears Exercise.video with its credit; the app reads it from GET /exercises/:id. */
describe("Exercise video", () => {
  const app = buildApp();
  let adminId = "";
  let adminAuth = "";
  let userId = "";
  let userAuth = "";
  let exerciseId = "";
  const adminPassword = "ExerciseVideoAdm9!";
  const video = {
    url: "https://media.example.com/exercises/romanian-deadlift.mp4",
    durationSec: 14,
    credit: {
      author: "Goulart",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://wger.de/en/exercise/507/view/",
      changes: "Re-encoded and trimmed, sound removed",
    },
  };

  beforeAll(async () => {
    const email = uniqueEmail("ev-admin");
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(adminPassword), fullName: "EV Admin", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email, password: adminPassword });
    adminAuth = `Bearer ${login.body.token}`;
    const u = await request(app).post("/auth/signup").send({ email: uniqueEmail("ev-user"), password: "SomePassword1!", fullName: "EV User" });
    userId = u.body.user.id;
    userAuth = `Bearer ${u.body.tokens.accessToken}`;
    const ex = await prisma.exercise.create({
      data: { name: `EV RDL ${Date.now()}`, muscleGroup: "hamstrings", equipment: "barbell", difficulty: "intermediate", instructions: ["Hinge."], status: "published" },
    });
    exerciseId = ex.id;
  });

  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("sets a credited video and the app reads it back", async () => {
    const res = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video });
    expect(res.status).toBe(200);
    expect(res.body.exercise.video).toEqual(video);
    const detail = await request(app).get(`/exercises/${exerciseId}`).set("Authorization", userAuth);
    expect(detail.status).toBe(200);
    expect(detail.body.video).toEqual(video);
  });

  it("a licensed clip needs its licence and source links; our own clip doesn't", async () => {
    const { licenceUrl: _l, ...noLicenceUrl } = video.credit;
    const { sourceUrl: _s, ...noSourceUrl } = video.credit;
    for (const credit of [noLicenceUrl, noSourceUrl, { ...video.credit, author: " " }, { ...video.credit, licence: "All rights reserved" }]) {
      const res = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video: { ...video, credit } });
      expect(res.status, JSON.stringify(credit)).toBe(400);
    }
    const own = await request(app)
      .patch(`/admin/exercises/${exerciseId}`)
      .set("Authorization", adminAuth)
      .send({ video: { ...video, credit: { author: "Fynrox", licence: "Own" } } });
    expect(own.status).toBe(200);
  });

  it("takes a royalty-free portrait clip with its own poster; rejects a bad shape or an http poster", async () => {
    const ymove = {
      url: "https://media.example.com/exercises/face-pull.mp4",
      durationSec: 18,
      aspect: "9:16",
      posterUrl: "https://media.example.com/exercises/posters/face-pull.jpg",
      credit: {
        author: "Your Move",
        licence: "Royalty-free",
        licenceUrl: "https://ymove.app/free-exercise-videos",
        sourceUrl: "https://ymove.app/free-exercise-videos",
      },
    };
    const ok = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video: ymove });
    expect(ok.status).toBe(200);
    expect(ok.body.exercise.video).toEqual(ymove);
    for (const v of [{ ...ymove, aspect: "4:3" }, { ...ymove, posterUrl: "http://media.example.com/p.jpg" }]) {
      const res = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video: v });
      expect(res.status, JSON.stringify(v)).toBe(400);
    }
  });

  it("rejects a non-https or non-video link and a bad length", async () => {
    for (const v of [{ ...video, url: "http://media.example.com/a.mp4" }, { ...video, url: "https://wger.de/media/a.MOV" }, { ...video, durationSec: 0 }, { ...video, durationSec: 121 }]) {
      const res = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video: v });
      expect(res.status, JSON.stringify(v)).toBe(400);
    }
  });

  it("null clears the video to a real NULL, and other edits leave it alone", async () => {
    await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video });
    const rename = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ equipment: "barbell" });
    expect(rename.body.exercise.video).toEqual(video);
    const cleared = await request(app).patch(`/admin/exercises/${exerciseId}`).set("Authorization", adminAuth).send({ video: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.exercise.video).toBeNull();
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM exercises WHERE id = ${exerciseId} AND video IS NULL`;
    expect(Number(rows[0].n)).toBe(1);
  });
});
