import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Meal-Plan Generation Engine (22 Sep 2026) — see
 * apps/api/src/modules/mealPlans/mealPlans.service.ts's own doc comment
 * for the full design. Same testing convention as plans.test.ts: the real
 * LLM call is mocked (`vi.mock("../src/lib/aiClient")`) rather than left
 * to hit the real "unconfigured in every test/dev/CI environment" 503 —
 * everything BELOW the AI call (Prisma writes, state transitions, the real
 * Recipe catalog) is real.
 */
const { generateCompletion, isAiConfigured } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
vi.mock("../src/lib/aiClient", () => ({ generateCompletion, isAiConfigured }));

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

/** Builds a raw AI response that picks `recipeIdBySlot[mealType]` for every day/slot — the one real recipe fixture for that meal type, repeated across all 7 days (the service's own prompt explicitly allows this when a slot's catalog is small). */
function buildRawResponse(recipeIdBySlot: Record<(typeof MEAL_TYPES)[number], string>, rationale = "Fits the reported diet type and goals."): string {
  const lines: string[] = [];
  for (let day = 1; day <= 7; day++) {
    for (const mealType of MEAL_TYPES) {
      lines.push(`DAY_${day}_${mealType.toUpperCase()}: ${recipeIdBySlot[mealType]}`);
    }
  }
  lines.push(`RATIONALE: ${rationale}`);
  return lines.join("\n");
}

describe("Meal-Plan Generation Engine", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  let recipeIdBySlot: Record<(typeof MEAL_TYPES)[number], string>;
  const createdRecipeIds: string[] = [];

  beforeAll(async () => {
    userEmail = uniqueEmail("mealplans");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Meal Plans Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    const suffix = `${Date.now()}`;
    recipeIdBySlot = {} as Record<(typeof MEAL_TYPES)[number], string>;
    for (const mealType of MEAL_TYPES) {
      const recipe = await prisma.recipe.create({
        data: {
          id: `test-mealplan-${mealType}-${suffix}`,
          name: `Test ${mealType} recipe`,
          mealType,
          calories: 400,
          proteinG: 20,
          carbsG: 40,
          fatG: 10,
          prepTimeMinutes: 10,
          tags: ["vegetarian"],
          status: "published",
        },
      });
      recipeIdBySlot[mealType] = recipe.id;
      createdRecipeIds.push(recipe.id);
    }
  });

  beforeEach(() => {
    generateCompletion.mockReset();
    isAiConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    await prisma.mealPlanItem.deleteMany({ where: { recipeId: { in: createdRecipeIds } } });
    await prisma.mealPlan.deleteMany({ where: { userId } });
    await prisma.recipe.deleteMany({ where: { id: { in: createdRecipeIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rejects generating a meal plan before the assessment (onboarding) is complete", async () => {
    const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("assessment_incomplete");
    expect(generateCompletion).not.toHaveBeenCalled();
  });

  it("503s cleanly when the AI provider isn't configured, without touching the database", async () => {
    isAiConfigured.mockReturnValue(false);
    const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("meal_plan_generation_not_configured");
    const count = await prisma.mealPlan.count({ where: { userId } });
    expect(count).toBe(0);
  });

  it("returns null for /nutrition/meal-plans/current before any plan exists", async () => {
    const res = await request(app).get("/nutrition/meal-plans/current").set("Authorization", `Bearer ${accessToken}`).send();
    expect(res.status).toBe(200);
    expect(res.body.mealPlan).toBeNull();
  });

  describe("once the assessment is complete", () => {
    beforeAll(async () => {
      await prisma.onboardingProfile.upsert({
        where: { userId },
        create: {
          userId,
          goals: ["build_muscle"],
          dietType: "vegetarian",
          allergens: ["peanuts"],
          medicalConditions: [],
          injuries: [],
          completedAt: new Date(),
        },
        update: { completedAt: new Date(), dietType: "vegetarian", allergens: ["peanuts"] },
      });
    });

    it("generates a real 7-day MealPlan, with every item referencing a real, catalog-eligible Recipe id", async () => {
      generateCompletion.mockResolvedValueOnce(buildRawResponse(recipeIdBySlot));

      const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("generated");
      expect(res.body.isActive).toBe(true);
      expect(res.body.durationDays).toBe(7);
      expect(res.body.version).toBe(1);
      expect(res.body.items).toHaveLength(28); // 7 days * 4 meal slots

      const validRecipeIds = new Set(Object.values(recipeIdBySlot));
      for (const item of res.body.items) {
        expect(validRecipeIds.has(item.recipeId)).toBe(true);
        expect(item.recipeName).toBeTruthy();
        expect(item.dayNumber).toBeGreaterThanOrEqual(1);
        expect(item.dayNumber).toBeLessThanOrEqual(7);
      }

      // Every real DB row also points at a real, still-existing Recipe —
      // never a fabricated id, confirmed at the persistence layer, not
      // just in the HTTP response.
      const dbItems = await prisma.mealPlanItem.findMany({ where: { mealPlanId: res.body.id } });
      expect(dbItems).toHaveLength(28);
      for (const dbItem of dbItems) {
        expect(validRecipeIds.has(dbItem.recipeId)).toBe(true);
      }

      const dbPlan = await prisma.mealPlan.findFirst({ where: { userId, isActive: true } });
      expect(dbPlan?.id).toBe(res.body.id);
      expect(dbPlan?.status).toBe("generated");
    });

    it("includes the user's real dietType/allergens in the meal-plan selection prompt", async () => {
      generateCompletion.mockResolvedValueOnce(buildRawResponse(recipeIdBySlot));
      const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("generated");

      const promptSent = generateCompletion.mock.calls[0][0] as string;
      expect(promptSent).toContain("vegetarian");
      expect(promptSent).toContain("peanuts");
    });

    it("fails honestly (not a fabricated fallback) when the AI names a recipe id that doesn't exist", async () => {
      const bogus = { ...recipeIdBySlot, breakfast: "not-a-real-recipe" };
      generateCompletion.mockResolvedValueOnce(buildRawResponse(bogus));

      const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201); // the request itself succeeds; the MealPlan row records a failed generation
      expect(res.body.status).toBe("failed");
      expect(res.body.items).toEqual([]);
      expect(res.body.failureReason).toBeTruthy();

      const dbItems = await prisma.mealPlanItem.count({ where: { mealPlanId: res.body.id } });
      expect(dbItems).toBe(0); // never partially persisted
    });

    it("fails honestly when the AI places a real recipe id under the wrong meal slot", async () => {
      // A lunch recipe id given for the breakfast slot — real id, wrong slot.
      const wrongSlot = { ...recipeIdBySlot, breakfast: recipeIdBySlot.lunch };
      generateCompletion.mockResolvedValueOnce(buildRawResponse(wrongSlot));

      const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("failed");
    });

    it("fails honestly when the AI's response can't be parsed at all", async () => {
      generateCompletion.mockResolvedValueOnce("I'm not sure, let me think about it.");

      const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("failed");
    });

    it("fails honestly when the upstream AI call throws", async () => {
      generateCompletion.mockRejectedValueOnce(new Error("upstream timeout"));

      const res = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("failed");
      expect(res.body.failureReason).toBeTruthy();
    });

    it("generating a new meal plan deactivates the previously active one — exactly one active plan at a time", async () => {
      generateCompletion.mockResolvedValueOnce(buildRawResponse(recipeIdBySlot));
      const first = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(first.body.isActive).toBe(true);

      generateCompletion.mockResolvedValueOnce(buildRawResponse(recipeIdBySlot, "Second plan, regenerated."));
      const second = await request(app).post("/nutrition/meal-plans/generate").set("Authorization", `Bearer ${accessToken}`).send();
      expect(second.body.isActive).toBe(true);
      expect(second.body.version).toBe(first.body.version + 1);

      const firstNow = await prisma.mealPlan.findUnique({ where: { id: first.body.id } });
      expect(firstNow?.isActive).toBe(false);

      const current = await request(app).get("/nutrition/meal-plans/current").set("Authorization", `Bearer ${accessToken}`).send();
      expect(current.body.mealPlan.id).toBe(second.body.id);
      expect(current.body.mealPlan.items).toHaveLength(28);
    });
  });
});
