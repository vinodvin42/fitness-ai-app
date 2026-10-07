import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";

/**
 * Profile & Settings (Figma section 11): saved recipes, partner code linking
 * and per-measure unit preferences. Runs against the real database.
 */
describe("Profile & Settings: saved recipes, partner code, unit preferences", () => {
  const app = buildApp();
  let auth: string;
  let userId: string;
  let recipeId: string;
  let draftRecipeId: string;
  let approvedGymId: string;
  let approvedCode: string;
  let suspendedCode: string;
  let applicationCode: string;
  let secondGymCode: string;
  const gymIds: string[] = [];

  beforeAll(async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("profset"), password: "SomePassword1!", fullName: "Profile Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;

    const s = uniqueSuffix().replace(/[^a-z0-9]/gi, "").toUpperCase();
    const recipe = await prisma.recipe.create({
      data: { name: `Saved recipe ${s}`, mealType: "lunch", calories: 400, prepTimeMinutes: 10, status: "published" },
    });
    recipeId = recipe.id;
    const draft = await prisma.recipe.create({
      data: { name: `Draft recipe ${s}`, mealType: "lunch", calories: 400, prepTimeMinutes: 10, status: "draft" },
    });
    draftRecipeId = draft.id;

    const mk = async (suffix: string, status: "application" | "approved" | "suspended") => {
      const g = await prisma.gym.create({
        data: {
          name: `Partner Gym ${suffix}`,
          status,
          contactName: "Owner",
          contactEmail: `owner-${suffix}@example.com`,
          inviteCode: `T${s.slice(-10)}${suffix}`,
          locations: { create: [{ name: "Main floor", address: "1 Test Road, Pune", equipment: "Racks, dumbbells" }] },
        },
      });
      gymIds.push(g.id);
      return g;
    };
    const approved = await mk("A", "approved");
    approvedGymId = approved.id;
    approvedCode = approved.inviteCode;
    suspendedCode = (await mk("S", "suspended")).inviteCode;
    applicationCode = (await mk("P", "application")).inviteCode;
    secondGymCode = (await mk("B", "approved")).inviteCode;
  });

  afterAll(async () => {
    await prisma.user.updateMany({ where: { gymId: { in: gymIds } }, data: { gymId: null } });
    await prisma.userPartnerLink.deleteMany({ where: { gymId: { in: gymIds } } });
    await prisma.gym.deleteMany({ where: { id: { in: gymIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: [recipeId, draftRecipeId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe("saved recipes", () => {
    it("saves idempotently, lists with savedAt, and unsaves", async () => {
      expect((await request(app).post("/saved-recipes").set("Authorization", auth).send({ recipeId })).status).toBe(201);
      expect((await request(app).post("/saved-recipes").set("Authorization", auth).send({ recipeId })).status).toBe(201);

      const list = await request(app).get("/saved-recipes").set("Authorization", auth);
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({ id: recipeId, calories: 400 });
      expect(list.body.items[0].savedAt).toBeTruthy();

      const del = await request(app).delete(`/saved-recipes/${recipeId}`).set("Authorization", auth);
      expect(del.body).toMatchObject({ recipeId, saved: false });
      // idempotent
      expect((await request(app).delete(`/saved-recipes/${recipeId}`).set("Authorization", auth)).status).toBe(200);
      expect((await request(app).get("/saved-recipes").set("Authorization", auth)).body.items).toHaveLength(0);
    });

    it("404s for an unknown or unpublished recipe and requires auth", async () => {
      const unknown = await request(app).post("/saved-recipes").set("Authorization", auth).send({ recipeId: "nope" });
      expect(unknown.status).toBe(404);
      const draft = await request(app).post("/saved-recipes").set("Authorization", auth).send({ recipeId: draftRecipeId });
      expect(draft.status).toBe(404);
      expect((await request(app).get("/saved-recipes")).status).toBe(401);
    });
  });

  describe("partner code", () => {
    it("has no partner until a code is linked", async () => {
      const res = await request(app).get("/users/me/partner").set("Authorization", auth);
      expect(res.status).toBe(200);
      expect(res.body.partner).toBeNull();
    });

    it("rejects unknown, application-stage and suspended codes with distinct errors", async () => {
      const post = (code: string) => request(app).post("/users/me/partner-code").set("Authorization", auth).send({ code });
      const notFound = await post("SARA20-NOPE");
      expect(notFound.status).toBe(404);
      expect(notFound.body.error.code).toBe("partner_code_not_found");
      expect((await post(applicationCode)).body.error.code).toBe("partner_code_not_found");
      const expired = await post(suspendedCode);
      expect(expired.status).toBe(410);
      expect(expired.body.error.code).toBe("partner_code_expired");
    });

    it("links a valid code (case-insensitive), exposes gym info, and sets the member's gym", async () => {
      const res = await request(app).post("/users/me/partner-code").set("Authorization", auth).send({ code: approvedCode.toLowerCase() });
      expect(res.status).toBe(201);
      expect(res.body.partner).toMatchObject({ code: approvedCode, active: true, offer: null });
      expect(res.body.partner.gym.locations[0]).toMatchObject({ name: "Main floor", address: "1 Test Road, Pune" });
      expect(res.body.partner.gym.contactEmail).toBeUndefined();
      expect((await prisma.user.findUnique({ where: { id: userId } }))?.gymId).toBe(approvedGymId);
    });

    it("refuses a second code unless replace is set, then replaces it", async () => {
      const post = (body: object) => request(app).post("/users/me/partner-code").set("Authorization", auth).send(body);
      const dup = await post({ code: secondGymCode });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("partner_code_already_linked");
      // an invalid replacement keeps the old link
      expect((await post({ code: "BADCODE", replace: true })).status).toBe(404);
      expect((await request(app).get("/users/me/partner").set("Authorization", auth)).body.partner.code).toBe(approvedCode);

      const replaced = await post({ code: secondGymCode, replace: true });
      expect(replaced.status).toBe(201);
      expect(replaced.body.partner.code).toBe(secondGymCode);
    });

    it("removes the link and clears the member's gym; removing again 404s", async () => {
      const del = await request(app).delete("/users/me/partner-code").set("Authorization", auth);
      expect(del.body).toEqual({ removed: true });
      expect((await prisma.user.findUnique({ where: { id: userId } }))?.gymId).toBeNull();
      expect((await request(app).get("/users/me/partner").set("Authorization", auth)).body.partner).toBeNull();
      expect((await request(app).delete("/users/me/partner-code").set("Authorization", auth)).status).toBe(404);
    });
  });

  describe("unit preferences", () => {
    it("persists per-measure units and rejects unknown values", async () => {
      const ok = await request(app)
        .patch("/users/me")
        .set("Authorization", auth)
        .send({ unitPreferences: { weight: "lb", height: "ft", distance: "mi", temperature: "F", water: "oz" } });
      expect(ok.status).toBe(200);
      expect(ok.body.user.unitPreferences).toEqual({ weight: "lb", height: "ft", distance: "mi", temperature: "F", water: "oz" });
      const me = await request(app).get("/users/me").set("Authorization", auth);
      expect(me.body.user.unitPreferences.weight).toBe("lb");
      expect(me.body.user.unitSystem).toBe("metric"); // legacy field untouched

      const bad = await request(app).patch("/users/me").set("Authorization", auth).send({ unitPreferences: { weight: "stone" } });
      expect(bad.status).toBe(400);
    });
  });
});
