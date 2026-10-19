import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/** Recipe video (Oct 2026): admin sets/clears Recipe.video; the app reads it from GET /recipes/:id. */
describe("Recipe video", () => {
  const app = buildApp();
  let adminId = "";
  let adminAuth = "";
  let userId = "";
  let userAuth = "";
  let recipeId = "";
  const adminPassword = "RecipeVideoAdm9!";
  const video = {
    url: "https://media.example.com/recipes/eggs-spinach.mp4",
    durationSec: 35,
    steps: [
      { step: 1, startSec: 2 },
      { step: 2, startSec: 8 },
      { step: 3, startSec: 18 },
    ],
  };

  beforeAll(async () => {
    const email = uniqueEmail("rv-admin");
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(adminPassword), fullName: "RV Admin", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email, password: adminPassword });
    adminAuth = `Bearer ${login.body.token}`;
    const u = await request(app).post("/auth/signup").send({ email: uniqueEmail("rv-user"), password: "SomePassword1!", fullName: "RV User" });
    userId = u.body.user.id;
    userAuth = `Bearer ${u.body.tokens.accessToken}`;
    const recipe = await prisma.recipe.create({
      data: {
        name: `RV eggs ${Date.now()}`,
        mealType: "breakfast",
        calories: 300,
        prepTimeMinutes: 10,
        instructions: ["Whisk the eggs.", "Wilt the spinach.", "Cook the eggs."],
        status: "published",
      },
    });
    recipeId = recipe.id;
  });

  afterAll(async () => {
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("sets a video with step markers and the app reads it back", async () => {
    const res = await request(app).patch(`/admin/recipes/${recipeId}`).set("Authorization", adminAuth).send({ video });
    expect(res.status).toBe(200);
    expect(res.body.recipe.video).toEqual(video);
    const detail = await request(app).get(`/recipes/${recipeId}`).set("Authorization", userAuth);
    expect(detail.status).toBe(200);
    expect(detail.body.video).toEqual(video);
  });

  it("rejects markers out of order, past the end, or a non-https/non-video link", async () => {
    const bad = [
      { ...video, steps: [{ step: 2, startSec: 8 }, { step: 1, startSec: 2 }] },
      { ...video, steps: [{ step: 1, startSec: 2 }, { step: 2, startSec: 2 }] },
      { ...video, steps: [{ step: 1, startSec: 35 }] },
      { ...video, url: "http://media.example.com/recipes/eggs.mp4" },
      { ...video, url: "https://media.example.com/recipes/eggs.html" },
      { ...video, durationSec: 0 },
    ];
    for (const v of bad) {
      const res = await request(app).patch(`/admin/recipes/${recipeId}`).set("Authorization", adminAuth).send({ video: v });
      expect(res.status, JSON.stringify(v)).toBe(400);
    }
  });

  it("rejects a marker for a step the recipe doesn't have", async () => {
    const res = await request(app)
      .patch(`/admin/recipes/${recipeId}`)
      .set("Authorization", adminAuth)
      .send({ video: { ...video, steps: [...video.steps, { step: 4, startSec: 30 }] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("video_step_out_of_range");
  });

  it("a new recipe can carry a video only without step markers", async () => {
    const base = { name: `RV new ${Date.now()}`, mealType: "lunch", calories: 400, prepTimeMinutes: 15 };
    const withMarkers = await request(app).post("/admin/recipes").set("Authorization", adminAuth).send({ ...base, video });
    expect(withMarkers.status).toBe(400);
    const plain = await request(app).post("/admin/recipes").set("Authorization", adminAuth).send({ ...base, video: { ...video, steps: [] } });
    expect(plain.status).toBe(201);
    expect(plain.body.recipe.video.steps).toEqual([]);
    await prisma.recipe.deleteMany({ where: { id: plain.body.recipe.id } });
  });

  it("null clears the video to a real NULL, and other edits leave it alone", async () => {
    await request(app).patch(`/admin/recipes/${recipeId}`).set("Authorization", adminAuth).send({ video });
    const rename = await request(app).patch(`/admin/recipes/${recipeId}`).set("Authorization", adminAuth).send({ calories: 310 });
    expect(rename.body.recipe.video).toEqual(video);
    const cleared = await request(app).patch(`/admin/recipes/${recipeId}`).set("Authorization", adminAuth).send({ video: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.recipe.video).toBeNull();
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM recipes WHERE id = ${recipeId} AND video IS NULL`;
    expect(Number(rows[0].n)).toBe(1);
  });
});
