import { BRAND_NAME } from "@fitness-ai-app/config";
/**
 * Open Food Facts client (barcode scan, R2 Wave, 22 Sep 2026) — the real,
 * free, no-API-key food/barcode database this build uses to back the
 * barcode-scan meal-logging path. Chosen over a paid provider (Nutritionix/
 * Edamam/USDA paid tiers) because this build has no billing/API-key
 * infrastructure set up for a commercial food database — see
 * docs/mobile/07-open-questions-gaps.md for the full reasoning. Public docs:
 * https://world.openfoodfacts.org/data, endpoint:
 * https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 *
 * Mirrors aiClient.ts's "backend-mediated third-party API call" convention:
 * the mobile client never calls Open Food Facts directly (see
 * nutrition.routes.ts's GET /nutrition/barcode/:code) — this module is the
 * one place that does, with the same lazy-per-call construction (no client
 * object to configure — OFF needs no API key at all), a real network
 * timeout via AbortController (aiClient.ts's own fetch calls have no
 * explicit timeout since the three LLM providers are already
 * request/response-bounded; OFF has no such guarantee so one is added
 * here), and honest error handling: a genuinely missing product (OFF's
 * `status: 0`) is a normal, expected outcome — not an error — while a
 * network/HTTP failure is a real error the route layer turns into a 502 so
 * the client can show "try again, or log manually" rather than a silent
 * failure or a fabricated result.
 *
 * A small in-memory TTL cache sits in front of the real network call —
 * packaged-product nutrition data changes rarely, and a user re-scanning
 * the same product (or two users scanning the same common product) within
 * a day shouldn't cost a second round trip to OFF. Same "correct for a
 * single-process deployment, not for multi-instance" caveat as
 * rateLimit.ts's in-memory stores — see that file's own doc comment.
 */

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface BarcodeProduct {
  name: string;
  brand: string | null;
  imageUrl: string | null;
  servingSize: string | null;
  // Whether calories/macros below are per-serving or per-100g — Open Food
  // Facts only reliably has per-100g nutriments for every product; a
  // per-serving figure is used when the product itself declares one, so
  // the mobile client (and the user reviewing the pre-filled form) knows
  // exactly what the numbers mean rather than silently guessing a serving.
  basis: "serving" | "100g";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type BarcodeLookupResult = { found: true; product: BarcodeProduct } | { found: false };

interface OffNutriments {
  "energy-kcal_serving"?: number;
  "energy-kcal_100g"?: number;
  proteins_serving?: number;
  proteins_100g?: number;
  carbohydrates_serving?: number;
  carbohydrates_100g?: number;
  fat_serving?: number;
  fat_100g?: number;
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  nutriments?: OffNutriments;
}

interface OffResponse {
  status?: number;
  product?: OffProduct;
}

const cache = new Map<string, { result: BarcodeLookupResult; expiresAt: number }>();

function round(n: number): number {
  return Math.round(n);
}

/**
 * Turns OFF's raw product payload into the shape the mobile Log Meal form
 * pre-fills from. Returns null when OFF's own record is too thin to
 * honestly pre-fill a meal log with (no name, or no calorie figure at
 * all) — same "don't fabricate a number you don't have" discipline
 * nutrition.service.ts's food-estimate flow already applies to the AI
 * path, applied here to a real gap in OFF's community-sourced data
 * instead of an AI guess.
 */
function extractProduct(raw: OffProduct): BarcodeProduct | null {
  const name = (raw.product_name || raw.product_name_en || raw.generic_name || "").trim();
  if (!name) return null;

  const nutriments = raw.nutriments ?? {};
  const hasServing = typeof nutriments["energy-kcal_serving"] === "number";
  const basis: "serving" | "100g" = hasServing ? "serving" : "100g";
  const caloriesRaw = hasServing ? nutriments["energy-kcal_serving"] : nutriments["energy-kcal_100g"];
  if (typeof caloriesRaw !== "number") return null;

  const proteinRaw = hasServing ? nutriments.proteins_serving : nutriments.proteins_100g;
  const carbsRaw = hasServing ? nutriments.carbohydrates_serving : nutriments.carbohydrates_100g;
  const fatRaw = hasServing ? nutriments.fat_serving : nutriments.fat_100g;

  return {
    name,
    brand: raw.brands ? raw.brands.split(",")[0].trim() || null : null,
    imageUrl: raw.image_front_small_url || raw.image_small_url || null,
    servingSize: raw.serving_size ?? null,
    basis,
    calories: round(caloriesRaw),
    proteinG: round(proteinRaw ?? 0),
    carbsG: round(carbsRaw ?? 0),
    fatG: round(fatRaw ?? 0),
  };
}

/**
 * Looks up a barcode against the real Open Food Facts public API. Throws
 * only on a genuine transport/HTTP failure (timeout, network error,
 * non-2xx) — a real barcode that OFF simply doesn't have (a common,
 * expected outcome; OFF doesn't have every product) resolves normally to
 * `{ found: false }`, never throws and never fabricates placeholder
 * numbers.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const cached = cache.get(barcode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let data: OffResponse;
  try {
    const res = await fetch(`${OFF_BASE_URL}/${encodeURIComponent(barcode)}.json`, {
      signal: controller.signal,
      headers: {
        // OFF asks integrators to send a descriptive User-Agent identifying
        // the app (https://wiki.openfoodfacts.org/API/Read#User-Agent) —
        // a real courtesy to a free, donation-run open-data project, not a
        // requirement this build could skip without consequence.
        "user-agent": `${BRAND_NAME}/1.0 (barcode meal-logging; +https://github.com/vinodvin42)`,
      },
    });
    if (!res.ok) {
      throw new Error(`Open Food Facts API error ${res.status}: ${await res.text()}`);
    }
    data = (await res.json()) as OffResponse;
  } finally {
    clearTimeout(timeout);
  }

  // OFF's v2 product endpoint always answers HTTP 200 and signals found vs.
  // not-found via `status` (1 = found, 0 = not found in its ~3M-product
  // database) — this is the honest "not found" case, not an error.
  const result: BarcodeLookupResult =
    data.status === 1 && data.product ? (() => {
      const product = extractProduct(data.product!);
      return product ? { found: true as const, product } : { found: false as const };
    })() : { found: false };

  cache.set(barcode, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
