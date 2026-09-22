import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Barcode scan lookup (R2 Wave, 22 Sep 2026) — GET /nutrition/barcode/:code.
 * See lib/openFoodFactsClient.ts's own doc comment for the full design.
 * Same reasoning as aiClient.test.ts: `fetch` is mocked at the HTTP
 * boundary with a realistic Open Food Facts v2 product response shape
 * (rather than mocking the whole client module), so the route, the schema
 * validation, and openFoodFactsClient.ts's own parsing/normalization logic
 * are all real and under test — only the actual network call is faked.
 */
describe("Barcode scan lookup (GET /nutrition/barcode/:code)", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("barcode-scan");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Barcode Scan Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.analyticsEvent.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns a real, normalized product for a found barcode with per-serving nutriments", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://world.openfoodfacts.org/api/v2/product/5449000000996.json");
      return new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Coca-Cola",
            brands: "Coca-Cola,The Coca-Cola Company",
            serving_size: "330 ml",
            image_front_small_url: "https://images.openfoodfacts.org/coke.jpg",
            nutriments: {
              "energy-kcal_serving": 139,
              "energy-kcal_100g": 42,
              proteins_serving: 0,
              proteins_100g: 0,
              carbohydrates_serving: 35,
              carbohydrates_100g: 10.6,
              fat_serving: 0,
              fat_100g: 0,
            },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .get("/nutrition/barcode/5449000000996")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      found: true,
      product: {
        name: "Coca-Cola",
        brand: "Coca-Cola",
        imageUrl: "https://images.openfoodfacts.org/coke.jpg",
        servingSize: "330 ml",
        basis: "serving",
        calories: 139,
        proteinG: 0,
        carbsG: 35,
        fatG: 0,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const events = await prisma.analyticsEvent.findMany({ where: { userId, name: "barcode.scanned" } });
    expect(events).toHaveLength(1);
  });

  it("falls back to per-100g nutriments when no per-serving figure is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: 1,
            product: {
              product_name: "Plain Oats",
              nutriments: { "energy-kcal_100g": 380, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await request(app)
      .get("/nutrition/barcode/5000112637922")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.product.basis).toBe("100g");
    expect(res.body.product.calories).toBe(380);
  });

  it("honestly reports not-found for a barcode Open Food Facts doesn't have (status: 0) — no fabricated numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 })),
    );

    const res = await request(app)
      .get("/nutrition/barcode/0000000000000")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("honestly reports not-found when OFF has the barcode but no usable name or calorie data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ status: 1, product: { product_name: "", nutriments: {} } }), { status: 200 }),
      ),
    );

    const res = await request(app)
      .get("/nutrition/barcode/1111111111111")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("returns a clean 502, not a raw crash, when the upstream call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 500 })),
    );

    const res = await request(app)
      .get("/nutrition/barcode/2222222222222")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("barcode_lookup_failed");
  });

  it("400s a malformed barcode before ever calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .get("/nutrition/barcode/not-a-barcode")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated request", async () => {
    const res = await request(app).get("/nutrition/barcode/5449000000996");
    expect(res.status).toBe(401);
  });
});
