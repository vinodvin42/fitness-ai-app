import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/** Fuel 02 — "My Saved Meals" CRUD and "Recent Foods" (distinct foods derived from the user's own meal logs). */
describe("Saved meals and recent foods", () => {
  const app = buildApp();
  const ids: string[] = [];
  let tokenA: string;
  let tokenB: string;

  async function signup(prefix: string) {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(prefix), password: "SomePassword1!", fullName: "Saved Meals Tester" });
    ids.push(res.body.user.id);
    return res.body.tokens.accessToken as string;
  }

  beforeAll(async () => {
    tokenA = await signup("saved-a");
    tokenB = await signup("saved-b");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("requires auth", async () => {
    expect((await request(app).get("/saved-meals")).status).toBe(401);
    expect((await request(app).get("/meal-logs/recent-foods")).status).toBe(401);
  });

  it("creates, lists (newest first), de-duplicates and deletes a saved meal", async () => {
    const auth = { Authorization: `Bearer ${tokenA}` };
    const created = await request(app)
      .post("/saved-meals")
      .set(auth)
      .send({ name: "Morning Shake", calories: 450, proteinG: 38, carbsG: 40, fatG: 14 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Morning Shake", calories: 450, proteinG: 38 });

    const again = await request(app)
      .post("/saved-meals")
      .set(auth)
      .send({ name: "Morning Shake", calories: 450, proteinG: 38, carbsG: 40, fatG: 14 });
    expect(again.body.id).toBe(created.body.id);

    await request(app).post("/saved-meals").set(auth).send({ name: "Chicken Rice Bowl", calories: 620 });
    const list = await request(app).get("/saved-meals").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.items.map((m: { name: string }) => m.name)).toEqual(["Chicken Rice Bowl", "Morning Shake"]);
    expect(list.body.items[0]).toMatchObject({ proteinG: 0, carbsG: 0, fatG: 0 });

    const del = await request(app).delete(`/saved-meals/${created.body.id}`).set(auth);
    expect(del.status).toBe(200);
    const after = await request(app).get("/saved-meals").set(auth);
    expect(after.body.items).toHaveLength(1);
  });

  it("validates input and isolates users", async () => {
    const authA = { Authorization: `Bearer ${tokenA}` };
    const authB = { Authorization: `Bearer ${tokenB}` };
    expect((await request(app).post("/saved-meals").set(authA).send({ name: "", calories: 10 })).status).toBe(400);
    expect((await request(app).post("/saved-meals").set(authA).send({ name: "x", calories: -5 })).status).toBe(400);

    const mine = (await request(app).get("/saved-meals").set(authA)).body.items[0];
    expect((await request(app).get("/saved-meals").set(authB)).body.items).toHaveLength(0);
    expect((await request(app).delete(`/saved-meals/${mine.id}`).set(authB)).status).toBe(404);
  });

  it("recent foods: distinct by name, latest macros, newest first, limited", async () => {
    const auth = { Authorization: `Bearer ${tokenB}` };
    const log = (name: string, calories: number) =>
      request(app).post("/meal-logs").set(auth).send({ mealType: "snack", name, calories });
    await log("Greek Yogurt", 100);
    await log("Whey Isolate", 130);
    await log("greek yogurt", 120);
    const res = await request(app).get("/meal-logs/recent-foods?limit=5").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual(["greek yogurt", "Whey Isolate"]);
    expect(res.body.items[0].calories).toBe(120);
    const limited = await request(app).get("/meal-logs/recent-foods?limit=1").set(auth);
    expect(limited.body.items).toHaveLength(1);
  });
});
