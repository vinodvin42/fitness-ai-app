import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { parseFoodEstimateItems } from "../src/modules/nutrition/nutrition.service";

/**
 * Itemised food estimates in Indian portions (24 Oct 2026, Figma fuel/11-12):
 * the AI reply's ITEM/ALT lines become FoodEstimate.items, and the totals are
 * their sum. The LLM call is mocked like tests/nutrition.test.ts.
 *
 * Rate limits: 1 consumer signup.
 */
const { generateCompletion, isAiConfigured } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
vi.mock("../src/lib/aiClient", () => ({ generateCompletion, isAiConfigured }));

const REPLY = [
  "STATUS: OK",
  "NAME: Roti, dal and paneer",
  "CALORIES: 700",
  "PROTEIN_G: 36",
  "CARBS_G: 78",
  "FAT_G: 26",
  "ITEM: Roti (wheat) | 2 | rotis | 80 | 240 | 8 | 40 | 6",
  "ITEM: Dal tadka | 1 | katori | 150 g | 150 | 7 | 20 | 5",
  "ITEM: Paneer bhurji | 1 | katori | 120 | 250 | 16 | 6 | 18",
  "ITEM: Curd | 1 | katori | 150 | 90 | 5 | 7 | 5",
  "ALT: Curd or raita? | Raita | 75 | 4 | 6 | 4",
  "ITEM: Broken line | two | spoons",
].join("\n");

describe("Itemised food estimates (Indian portions)", () => {
  const app = buildApp();
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail("food-items"), password: "SomePassword1!", fullName: "Items Tester" });
    userId = res.body.user.id;
    token = res.body.tokens.accessToken;
  });
  beforeEach(() => {
    generateCompletion.mockReset();
    isAiConfigured.mockReturnValue(true);
  });
  afterAll(async () => {
    await prisma.mealLog.deleteMany({ where: { userId } });
    await prisma.foodEstimate.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("I1 parses ITEM and ALT lines, normalising units and skipping malformed lines", () => {
    const items = parseFoodEstimateItems(REPLY);
    expect(items.map((i) => [i.name, i.amount, i.unit, i.grams])).toEqual([
      ["Roti (wheat)", 2, "roti", 80],
      ["Dal tadka", 1, "katori", 150],
      ["Paneer bhurji", 1, "katori", 120],
      ["Curd", 1, "katori", 150],
    ]);
    expect(items[3].alt).toEqual({ question: "Curd or raita?", name: "Raita", calories: 75, proteinG: 4, carbsG: 6, fatG: 4 });
  });

  it("I2 stores the items and uses their sum as the totals", async () => {
    generateCompletion.mockResolvedValueOnce(REPLY);
    const res = await request(app).post("/food-estimates").set("Authorization", `Bearer ${token}`).send({ mealType: "lunch", description: "roti dal paneer curd" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("estimated");
    expect(res.body.items).toHaveLength(4);
    expect(res.body.calories).toBe(730);
    expect(res.body.proteinG).toBe(36);
  });

  it("I3 a reply without ITEM lines still works as a single estimate", async () => {
    generateCompletion.mockResolvedValueOnce("STATUS: OK\nNAME: Toast\nCALORIES: 150\nPROTEIN_G: 4\nCARBS_G: 25\nFAT_G: 3");
    const res = await request(app).post("/food-estimates").set("Authorization", `Bearer ${token}`).send({ mealType: "breakfast", description: "toast" });
    expect(res.status).toBe(201);
    expect(res.body.items ?? null).toBeNull();
    expect(res.body.calories).toBe(150);
  });

  it("I4 confirming with the reviewed totals logs one meal", async () => {
    generateCompletion.mockResolvedValueOnce(REPLY);
    const est = await request(app).post("/food-estimates").set("Authorization", `Bearer ${token}`).send({ mealType: "dinner", description: "roti dal" });
    const res = await request(app)
      .post(`/food-estimates/${est.body.id}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Roti (wheat), Dal tadka", calories: 390, proteinG: 15, carbsG: 60, fatG: 11 });
    expect(res.status).toBe(200);
    const log = await prisma.mealLog.findFirstOrThrow({ where: { userId, mealType: "dinner" } });
    expect(log.calories).toBe(390);
    expect(log.name).toBe("Roti (wheat), Dal tadka");
  });
});
