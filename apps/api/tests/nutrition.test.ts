import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Food input data-quality flow (U4, 15 Sep 2026) — see
 * apps/api/src/modules/nutrition/nutrition.service.ts's own doc comment,
 * and the FoodEstimate model's doc comment (schema.prisma), for the full
 * design. Same reasoning as tests/plans.test.ts: the real LLM call is
 * mocked (`vi.mock("../src/lib/aiClient")`) rather than depending on a real
 * Azure OpenAI/Anthropic/OpenAI key in every test/dev/CI environment —
 * everything BELOW the AI call (Prisma writes, the confirm/edit state
 * transition, the real MealLog it produces) is real.
 */
const { generateCompletion, isAiConfigured } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
vi.mock("../src/lib/aiClient", () => ({ generateCompletion, isAiConfigured }));

describe("Food input data-quality flow (Estimate -> Confirm/Edit)", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("food-estimate");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Food Estimate Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
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

  it("503s cleanly when the AI provider isn't configured, without touching the database", async () => {
    isAiConfigured.mockReturnValue(false);
    const res = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "breakfast", description: "2 eggs and toast" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("food_estimate_not_configured");
    expect(generateCompletion).not.toHaveBeenCalled();
  });

  it("estimates from a photo: forwards the image to the AI client, returns the same FoodEstimate shape, never stores the image", async () => {
    generateCompletion.mockResolvedValueOnce("STATUS: OK\nNAME: Dal and rice\nCALORIES: 480\nPROTEIN_G: 16\nCARBS_G: 80\nFAT_G: 9");
    const res = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "lunch", imageDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("estimated");
    expect(res.body.calories).toBe(480);
    expect(res.body.description).toBe("Meal photo");
    expect(res.body.imageDataUrl).toBeUndefined();
    expect(generateCompletion).toHaveBeenCalledTimes(1);
    expect(generateCompletion.mock.calls[0][1]).toEqual({ image: { mediaType: "image/jpeg", base64: "/9j/4AAQSkZJRg==" } });
  });

  it("rejects non-JPEG/PNG, malformed, oversized images, and requests with neither description nor image", async () => {
    const send = (body: object) =>
      request(app).post("/food-estimates").set("Authorization", `Bearer ${accessToken}`).send({ mealType: "lunch", ...body });
    expect((await send({ imageDataUrl: "data:image/gif;base64,R0lGODlh" })).status).toBe(400);
    expect((await send({ imageDataUrl: "not-a-data-url" })).status).toBe(400);
    expect((await send({ imageDataUrl: "data:image/png;base64," + "A".repeat(1_600_000) })).status).toBe(400);
    expect((await send({})).status).toBe(400);
    expect(generateCompletion).not.toHaveBeenCalled();
  });

  it("creates a real, unconfirmed FoodEstimate from a parseable AI response — never writes a MealLog yet (BR-DAT-003)", async () => {
    generateCompletion.mockResolvedValueOnce(
      "STATUS: OK\nNAME: Eggs and toast\nCALORIES: 350\nPROTEIN_G: 20\nCARBS_G: 30\nFAT_G: 15",
    );

    const res = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "breakfast", description: "2 eggs and a slice of toast" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("estimated");
    expect(res.body.name).toBe("Eggs and toast");
    expect(res.body.calories).toBe(350);
    expect(res.body.mealLogId).toBeNull();

    const mealLogCount = await prisma.mealLog.count({ where: { userId } });
    expect(mealLogCount).toBe(0); // the estimate alone must never create logged fact data
  });

  it("fails honestly into insufficient_context when the AI says the description is too vague (BR-DAT-004)", async () => {
    generateCompletion.mockResolvedValueOnce("STATUS: INSUFFICIENT_CONTEXT");

    const res = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "snack", description: "food" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("insufficient_context");
    expect(res.body.calories).toBeNull();
    expect(res.body.failureReason).toBeTruthy();
  });

  it("fails honestly into insufficient_context when the AI's response can't be parsed at all", async () => {
    generateCompletion.mockResolvedValueOnce("I'm not sure what that is.");

    const res = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "lunch", description: "some kind of sandwich thing" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("insufficient_context");
  });

  it("confirming an estimate as-is (no edits) creates a real MealLog tagged 'confirmed' and source ai_estimate", async () => {
    generateCompletion.mockResolvedValueOnce(
      "STATUS: OK\nNAME: Grilled chicken bowl\nCALORIES: 520\nPROTEIN_G: 40\nCARBS_G: 45\nFAT_G: 18",
    );
    const estimateRes = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "dinner", description: "grilled chicken bowl with rice" });
    const estimateId = estimateRes.body.id;

    const confirmRes = await request(app)
      .post(`/food-estimates/${estimateId}/confirm`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.name).toBe("Grilled chicken bowl");
    expect(confirmRes.body.calories).toBe(520);
    expect(confirmRes.body.source).toBe("ai_estimate");
    expect(confirmRes.body.mealType).toBe("dinner");

    const dbEstimate = await prisma.foodEstimate.findUnique({ where: { id: estimateId } });
    expect(dbEstimate?.status).toBe("confirmed");
    expect(dbEstimate?.mealLogId).toBe(confirmRes.body.id);

    const dbMealLog = await prisma.mealLog.findUnique({ where: { id: confirmRes.body.id } });
    expect(dbMealLog?.source).toBe("ai_estimate");
  });

  it("editing a field before logging tags the estimate 'edited', and the MealLog reflects the edited value, not the AI's original guess", async () => {
    generateCompletion.mockResolvedValueOnce(
      "STATUS: OK\nNAME: Protein shake\nCALORIES: 200\nPROTEIN_G: 25\nCARBS_G: 10\nFAT_G: 5",
    );
    const estimateRes = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "snack", description: "protein shake" });
    const estimateId = estimateRes.body.id;

    const confirmRes = await request(app)
      .post(`/food-estimates/${estimateId}/confirm`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ calories: 260 }); // the user corrects the AI's guess

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.calories).toBe(260);

    const dbEstimate = await prisma.foodEstimate.findUnique({ where: { id: estimateId } });
    expect(dbEstimate?.status).toBe("edited");
    expect(dbEstimate?.calories).toBe(260); // the estimate row itself is updated to the edited value too
  });

  it("rejects confirming an insufficient_context estimate — there are no real numbers to confirm", async () => {
    generateCompletion.mockResolvedValueOnce("STATUS: INSUFFICIENT_CONTEXT");
    const estimateRes = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "snack", description: "food" });

    const confirmRes = await request(app)
      .post(`/food-estimates/${estimateRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(confirmRes.status).toBe(409);
    expect(confirmRes.body.error.code).toBe("food_estimate_not_confirmable");
  });

  it("rejects confirming the same estimate twice — an estimate can only ever produce one MealLog", async () => {
    generateCompletion.mockResolvedValueOnce("STATUS: OK\nNAME: Toast\nCALORIES: 150\nPROTEIN_G: 4\nCARBS_G: 25\nFAT_G: 3");
    const estimateRes = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "breakfast", description: "plain toast" });

    await request(app)
      .post(`/food-estimates/${estimateRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    const secondConfirm = await request(app)
      .post(`/food-estimates/${estimateRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(secondConfirm.status).toBe(409);
  });

  it("two truly concurrent confirms on the same estimate still produce exactly one MealLog (not just sequential ones)", async () => {
    // Same class of race the sequential test above can't catch — two
    // requests that both read the estimate as "estimated" before either
    // write lands (a double-tap, or a client retry racing its own earlier
    // in-flight request). See confirmFoodEstimate's own doc comment: the
    // real gate is the atomic `updateMany` claim, not the initial read.
    generateCompletion.mockResolvedValueOnce("STATUS: OK\nNAME: Omelette\nCALORIES: 300\nPROTEIN_G: 20\nCARBS_G: 5\nFAT_G: 22");
    const estimateRes = await request(app)
      .post("/food-estimates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mealType: "breakfast", description: "cheese omelette" });

    const [first, second] = await Promise.all([
      request(app)
        .post(`/food-estimates/${estimateRes.body.id}/confirm`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({}),
      request(app)
        .post(`/food-estimates/${estimateRes.body.id}/confirm`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({}),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const mealLogs = await prisma.mealLog.findMany({ where: { userId, name: "Omelette" } });
    expect(mealLogs).toHaveLength(1);
  });

  it("404s confirming an estimate id that doesn't belong to this user", async () => {
    const res = await request(app)
      .post("/food-estimates/not-a-real-id/confirm")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("food_estimate_not_found");
  });
});
