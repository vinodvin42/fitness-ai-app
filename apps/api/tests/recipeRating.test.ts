import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * "How was it?" after cooking (Figma fuel/17, 24 Oct 2026): one private
 * rating per member and recipe, 1 Not for me … 4 Loved it.
 *
 * Rate limits: 1 consumer signup.
 */
describe("Recipe rating", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let recipeId: string;
  let draftId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("recipe-rating"), password: "SomePassword1!", fullName: "Rating Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
    const base = { mealType: "lunch" as const, calories: 460, prepTimeMinutes: 20 };
    recipeId = (await prisma.recipe.create({ data: { ...base, name: `Paneer bowl ${Date.now()}`, status: "published" } })).id;
    draftId = (await prisma.recipe.create({ data: { ...base, name: `Draft bowl ${Date.now()}`, status: "draft" } })).id;
  });

  afterAll(async () => {
    await prisma.recipe.deleteMany({ where: { id: { in: [recipeId, draftId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("R1 no rating yet reads back as null", async () => {
    const res = await request(app).get(`/recipes/${recipeId}/rating`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recipeId, rating: null });
  });

  it("R2 a rating is saved, and a new answer replaces it", async () => {
    expect((await request(app).put(`/recipes/${recipeId}/rating`).set(auth()).send({ rating: 3 })).body).toEqual({ recipeId, rating: 3 });
    await request(app).put(`/recipes/${recipeId}/rating`).set(auth()).send({ rating: 4 });
    expect((await request(app).get(`/recipes/${recipeId}/rating`).set(auth())).body.rating).toBe(4);
    expect(await prisma.recipeRating.count({ where: { userId, recipeId } })).toBe(1);
  });

  it("R3 out-of-range ratings and unpublished recipes are refused", async () => {
    expect((await request(app).put(`/recipes/${recipeId}/rating`).set(auth()).send({ rating: 5 })).status).toBe(400);
    expect((await request(app).put(`/recipes/${recipeId}/rating`).set(auth()).send({ rating: 0 })).status).toBe(400);
    expect((await request(app).put(`/recipes/${draftId}/rating`).set(auth()).send({ rating: 2 })).status).toBe(404);
  });

  it("R4 clearing is idempotent", async () => {
    expect((await request(app).delete(`/recipes/${recipeId}/rating`).set(auth())).body.rating).toBeNull();
    expect((await request(app).delete(`/recipes/${recipeId}/rating`).set(auth())).status).toBe(200);
    expect((await request(app).get(`/recipes/${recipeId}/rating`).set(auth())).body.rating).toBeNull();
  });
});
