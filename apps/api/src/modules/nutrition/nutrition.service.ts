import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";
import { generateCompletion, isAiConfigured } from "../../lib/aiClient";
import type { BarcodeLookupResult } from "../../lib/openFoodFactsClient";
import { foodDataProvider } from "../../providers";
import {
  ConfirmFoodEstimateInput,
  CreateFoodEstimateInput,
  LogMealInput,
  LogWaterInput,
  parseFoodImageDataUrl,
} from "./nutrition.schema";

/**
 * The Fuel/Nutrition daily loop (docs/mobile/03-screen-inventory.md §D):
 * fetch today's logged meals for the Nutrition Dashboard's meal timeline,
 * and log a new one either from a Recipe or via manual macro entry. Also
 * (19 Aug 2026) the same daily loop for WaterLog — the dashboard's
 * water-intake tracker. Phase 1 scope only — no edit/delete of a logged
 * meal or water entry (matches how WorkoutSession set logs are append-only
 * in this same pass). Also (19 Aug 2026) `listMealHistory` — every meal
 * logged, all-time — backing the Nutrition Calendar screen.
 *
 * U4 (15 Sep 2026) added the Food input data-quality flow below
 * (createFoodEstimate / confirmFoodEstimate) — BR-DAT-003 ("estimated data
 * is not actual until confirmed/edited where required"). `logMeal` above
 * (manual entry) is deliberately left untouched: the user is typing exact
 * numbers they're asserting as true, not reviewing an AI guess, so there's
 * no "estimate" to confirm — BR-DAT-003 has nothing to grab onto there.
 * The new flow only applies to the genuinely new AI-estimate input method.
 */

function startOfToday(): Date {
  // NOTE: UTC day boundary, not the user's local timezone — there's no
  // stored timezone/offset for a user yet. Flagged as a known simplification,
  // same pattern as other Phase 1 gaps (see docs/mobile/07-open-questions-gaps.md).
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getTodayMealLogs(userId: string) {
  return prisma.mealLog.findMany({
    where: { userId, loggedAt: { gte: startOfToday() } },
    orderBy: { loggedAt: "asc" },
  });
}

// Nutrition Calendar (docs/mobile/03-screen-inventory.md §D): every meal
// this user has ever logged, all-time (not just today), so the calendar can
// page through any month. Same "fetch everything, group by day/month
// client-side" pattern as Workout History's listHistory and Timeline Month
// grouping Timeline Overview's events — no new server-side "compliance" or
// per-day-summary concept is introduced here; that's computed in the mobile
// screen itself (see gap §28 for why "compliance" is this pass's own
// interpretation, not a literal design spec).
export function listMealHistory(userId: string) {
  return prisma.mealLog.findMany({
    where: { userId },
    orderBy: { loggedAt: "asc" },
  });
}

export async function logMeal(userId: string, input: LogMealInput) {
  let entry: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    recipeId: string | null;
    source: "recipe" | "manual";
  };

  if (input.recipeId) {
    const recipe = await prisma.recipe.findUnique({ where: { id: input.recipeId } });
    if (!recipe) {
      throw new ApiHttpError(404, "recipe_not_found", "Recipe not found");
    }
    entry = {
      name: recipe.name,
      calories: recipe.calories,
      proteinG: recipe.proteinG,
      carbsG: recipe.carbsG,
      fatG: recipe.fatG,
      recipeId: recipe.id,
      source: "recipe",
    };
  } else {
    // logMealSchema's refine() guarantees name/calories are present here.
    entry = {
      name: input.name!,
      calories: input.calories!,
      proteinG: input.proteinG ?? 0,
      carbsG: input.carbsG ?? 0,
      fatG: input.fatG ?? 0,
      recipeId: null,
      source: "manual",
    };
  }

  const mealLog = await prisma.mealLog.create({
    data: { userId, mealType: input.mealType, ...entry },
  });

  await recordAudit({
    actorId: userId,
    action: "meal_log.created",
    entityType: "MealLog",
    entityId: mealLog.id,
    metadata: { source: entry.source, mealType: input.mealType },
  });

  // §8 "meal.logged"
  await trackEvent(userId, "meal.logged", { mealLogId: mealLog.id }, { metadata: { source: entry.source, mealType: input.mealType } });

  return mealLog;
}

export function getTodayWaterLogs(userId: string) {
  return prisma.waterLog.findMany({
    where: { userId, loggedAt: { gte: startOfToday() } },
    orderBy: { loggedAt: "asc" },
  });
}

export async function logWater(userId: string, input: LogWaterInput) {
  const waterLog = await prisma.waterLog.create({
    data: { userId, glasses: input.glasses },
  });

  await recordAudit({
    actorId: userId,
    action: "water_log.created",
    entityType: "WaterLog",
    entityId: waterLog.id,
    metadata: { glasses: input.glasses },
  });

  return waterLog;
}

// ---- Food input data-quality flow (U4, 15 Sep 2026) -----------------------
// See FoodEstimate's own doc comment (schema.prisma) for the full design.

/**
 * Both prompts below ask for a strict, parseable shape and an honest
 * "I can't tell" escape hatch rather than a guessed number — the same
 * "ground it, then validate the answer before trusting it" discipline
 * plans.service.ts already establishes for this codebase (see that file's
 * own top-of-file doc comment), applied here to BR-DAT-004's "weak/
 * conflicting/missing evidence" principle: a vague or empty food
 * description is real grounds for INSUFFICIENT_CONTEXT, not a fabricated
 * calorie count.
 */
function buildFoodEstimatePrompt(mealType: string, description: string, hasImage = false): string {
  return [
    hasImage
      ? "You are estimating the nutrition (calories and macros) of the meal shown in the attached photo a user took in a fitness app. Estimate portion size from what is visible."
      : "You are estimating the nutrition (calories and macros) of a food description a user typed into a fitness app's meal log.",
    "This is a rough ESTIMATE the user will review and can edit before it's treated as real logged data — not a final, authoritative answer.",
    `Meal type: ${mealType}. ${hasImage ? "Optional user note" : "Food description"}: "${description}"`,
    hasImage
      ? "If the photo doesn't clearly show identifiable food, say so honestly rather than guessing numbers."
      : "If the description doesn't name any identifiable food (empty, gibberish, or something with no specifics like just 'food' or 'meal'), say so honestly rather than guessing numbers.",
    "Respond in EXACTLY this format, nothing else:",
    "STATUS: <either OK or INSUFFICIENT_CONTEXT>",
    "NAME: <a short 2-6 word name for this food/meal — only if STATUS is OK>",
    "CALORIES: <integer kcal — only if STATUS is OK>",
    "PROTEIN_G: <integer grams — only if STATUS is OK>",
    "CARBS_G: <integer grams — only if STATUS is OK>",
    "FAT_G: <integer grams — only if STATUS is OK>",
  ].join("\n\n");
}

interface ParsedFoodEstimate {
  ok: boolean;
  name?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

function parseFoodEstimate(raw: string): ParsedFoodEstimate | null {
  const statusMatch = raw.match(/STATUS:\s*(\S+)/i);
  if (!statusMatch) return null;
  const status = statusMatch[1].trim().toUpperCase();
  if (status === "INSUFFICIENT_CONTEXT") return { ok: false };
  if (status !== "OK") return null;

  const nameMatch = raw.match(/NAME:\s*(.+)/i);
  const caloriesMatch = raw.match(/CALORIES:\s*(\d+)/i);
  const proteinMatch = raw.match(/PROTEIN_G:\s*(\d+)/i);
  const carbsMatch = raw.match(/CARBS_G:\s*(\d+)/i);
  const fatMatch = raw.match(/FAT_G:\s*(\d+)/i);
  if (!nameMatch || !caloriesMatch || !proteinMatch || !carbsMatch || !fatMatch) return null;

  const name = nameMatch[1].split("\n")[0].trim();
  const calories = parseInt(caloriesMatch[1], 10);
  const proteinG = parseInt(proteinMatch[1], 10);
  const carbsG = parseInt(carbsMatch[1], 10);
  const fatG = parseInt(fatMatch[1], 10);
  // Same range sanity-check confirmFoodEstimateSchema itself applies to a
  // user-supplied edit — an AI answer isn't exempt from the same bounds.
  if (!name || calories > 10000 || proteinG > 1000 || carbsG > 1000 || fatG > 1000) return null;

  return { ok: true, name, calories, proteinG, carbsG, fatG };
}

/**
 * Calls the real AI provider to estimate a food description's nutrition,
 * and persists the result — synchronously, same convention as
 * plans.service.ts's generatePlan (the request awaits the real LLM call and
 * resolves with a final status, never a persisted in-flight state). Unlike
 * Plan, there's no pre-call row and no retry-in-place: an unusable AI
 * response just becomes an `insufficient_context` row, and the client's own
 * retry is submitting the description again (or falling back to manual
 * entry), not re-running this exact row.
 */
export async function createFoodEstimate(userId: string, input: CreateFoodEstimateInput) {
  if (!isAiConfigured()) {
    throw new ApiHttpError(
      503,
      "food_estimate_not_configured",
      "AI food estimation isn't configured on this server yet — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or the AZURE_OPENAI_* trio, or use manual entry instead",
    );
  }

  // Photo path: the image goes to the vision model only and is never stored.
  // description stays a required column, so a photo-only estimate records a
  // short placeholder instead.
  const image = input.imageDataUrl ? parseFoodImageDataUrl(input.imageDataUrl) : undefined;
  const description = input.description?.trim() || "Meal photo";

  let raw: string;
  try {
    raw = await generateCompletion(
      buildFoodEstimatePrompt(input.mealType, description, Boolean(image)),
      image ? { image } : undefined,
    );
  } catch {
    const estimate = await prisma.foodEstimate.create({
      data: {
        userId,
        mealType: input.mealType,
        description,
        status: "insufficient_context",
        failureReason: "The estimate service didn't respond — try again, or use manual entry instead",
      },
    });
    await recordAudit({
      actorId: userId,
      action: "food_estimate.created",
      entityType: "FoodEstimate",
      entityId: estimate.id,
      metadata: { status: "insufficient_context", reason: "upstream_error" },
    });
    // §8 "food_estimate.created"
    await trackEvent(userId, "food_estimate.created", { foodEstimateId: estimate.id }, { metadata: { status: "insufficient_context" } });
    return estimate;
  }

  const parsed = parseFoodEstimate(raw);
  const estimate = await prisma.foodEstimate.create({
    data:
      parsed && parsed.ok
        ? {
            userId,
            mealType: input.mealType,
            description,
            status: "estimated",
            name: parsed.name,
            calories: parsed.calories,
            proteinG: parsed.proteinG,
            carbsG: parsed.carbsG,
            fatG: parsed.fatG,
          }
        : {
            userId,
            mealType: input.mealType,
            description,
            status: "insufficient_context",
            failureReason: "Not enough detail to estimate this — try describing it differently, or use manual entry",
          },
  });

  await recordAudit({
    actorId: userId,
    action: "food_estimate.created",
    entityType: "FoodEstimate",
    entityId: estimate.id,
    metadata: { status: estimate.status, reason: parsed && parsed.ok ? undefined : "unparseable_or_insufficient" },
  });

  // §8 "food_estimate.created"
  await trackEvent(userId, "food_estimate.created", { foodEstimateId: estimate.id }, { metadata: { status: estimate.status } });

  return estimate;
}

/**
 * The confirm/edit gate BR-DAT-003 requires: only this function ever
 * creates the real MealLog row for an AI estimate, and only once — an
 * estimate that's already been confirmed/edited (mealLogId already set) or
 * that never produced real numbers (insufficient_context) can't be
 * confirmed again. Whether the result is "confirmed" or "edited" is decided
 * here, not by the client: it's `edited` if ANY field the caller sent
 * differs from the estimate's own original value, `confirmed` otherwise
 * (including when the caller sends no fields at all — an as-is accept).
 *
 * The initial `status !== "estimated"` check below is a fast path only —
 * it reads its own snapshot, same shape as the race
 * apps/api/tests/paymentsActivationRace.test.ts documents for
 * payments.service.ts's activatePayment(). Two concurrent confirms (a
 * double-tap, or a client retry after a timed-out-but-actually-succeeded
 * request) could both pass it. The actual claim below is the real gate:
 * an atomic `updateMany` filtered on `status: "estimated"`, so only
 * whichever call's update actually flips the row proceeds to create the
 * MealLog — the loser sees `count === 0` and 409s, same outcome as today
 * but race-safe.
 */
export async function confirmFoodEstimate(userId: string, estimateId: string, input: ConfirmFoodEstimateInput) {
  const estimate = await prisma.foodEstimate.findUnique({ where: { id: estimateId } });
  if (!estimate || estimate.userId !== userId) {
    throw new ApiHttpError(404, "food_estimate_not_found", "Food estimate not found");
  }
  if (estimate.status !== "estimated") {
    throw new ApiHttpError(
      409,
      "food_estimate_not_confirmable",
      estimate.status === "insufficient_context"
        ? "This estimate has no usable numbers to confirm — try describing it differently, or use manual entry"
        : "This estimate was already logged",
    );
  }

  const finalName = input.name ?? estimate.name!;
  const finalCalories = input.calories ?? estimate.calories!;
  const finalProteinG = input.proteinG ?? estimate.proteinG!;
  const finalCarbsG = input.carbsG ?? estimate.carbsG!;
  const finalFatG = input.fatG ?? estimate.fatG!;
  const wasEdited =
    finalName !== estimate.name ||
    finalCalories !== estimate.calories ||
    finalProteinG !== estimate.proteinG ||
    finalCarbsG !== estimate.carbsG ||
    finalFatG !== estimate.fatG;

  // The real gate: only the caller whose update actually flips the row
  // proceeds. A concurrent loser affects zero rows here and 409s below,
  // never creating a second MealLog for the same estimate.
  const claimed = await prisma.foodEstimate.updateMany({
    where: { id: estimateId, status: "estimated" },
    data: {
      status: wasEdited ? "edited" : "confirmed",
      confirmedAt: new Date(),
      ...(wasEdited
        ? { name: finalName, calories: finalCalories, proteinG: finalProteinG, carbsG: finalCarbsG, fatG: finalFatG }
        : {}),
    },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "food_estimate_not_confirmable", "This estimate was already logged");
  }

  const mealLog = await prisma.mealLog.create({
    data: {
      userId,
      mealType: estimate.mealType,
      name: finalName,
      calories: finalCalories,
      proteinG: finalProteinG,
      carbsG: finalCarbsG,
      fatG: finalFatG,
      source: "ai_estimate",
    },
  });

  await prisma.foodEstimate.update({ where: { id: estimateId }, data: { mealLogId: mealLog.id } });

  await recordAudit({
    actorId: userId,
    action: wasEdited ? "food_estimate.edited" : "food_estimate.confirmed",
    entityType: "FoodEstimate",
    entityId: estimateId,
    metadata: { mealLogId: mealLog.id },
  });
  await recordAudit({
    actorId: userId,
    action: "meal_log.created",
    entityType: "MealLog",
    entityId: mealLog.id,
    metadata: { source: "ai_estimate", mealType: estimate.mealType, edited: wasEdited },
  });

  // §8 "food_estimate.confirmed"/"food_estimate.edited" (BR-DAT-003 — see
  // this function's own doc comment) and "meal.logged" — the same real
  // MealLog-creation moment as logMeal()'s own trackEvent above, just via
  // the AI-estimate path.
  await trackEvent(
    userId,
    wasEdited ? "food_estimate.edited" : "food_estimate.confirmed",
    { foodEstimateId: estimateId, mealLogId: mealLog.id },
    { ruleId: "BR-DAT-003" },
  );
  await trackEvent(userId, "meal.logged", { mealLogId: mealLog.id }, { metadata: { source: "ai_estimate", mealType: estimate.mealType, edited: wasEdited } });

  return mealLog;
}

// ---- Barcode scan lookup (R2 Wave, 22 Sep 2026) ----------------------------
// See lib/openFoodFactsClient.ts's own doc comment for the full design.
// This is a read-only proxy, not a new input method's write path — a
// found barcode just becomes numbers the mobile Log Meal screen pre-fills
// its EXISTING manual-entry card with; the user still confirms/edits and
// submits through the existing POST /meal-logs (logMeal above), so there's
// no second MealLog-creation path and no persisted row for a scan itself.

/**
 * Looks up a barcode against Open Food Facts. A transient failure from the
 * client (timeout, network error, non-2xx) is turned into a clean 502 here
 * rather than a generic 500 — same "tell the user honestly what happened,
 * point at the real fallback" discipline as createFoodEstimate's own
 * upstream-error handling above, except there's no row to persist for a
 * lookup that never becomes a MealLog on its own.
 */
export async function lookupBarcodeProduct(userId: string, code: string): Promise<BarcodeLookupResult> {
  let result: BarcodeLookupResult;
  try {
    // D8 — through the adapter, so the vendor is a config value.
    result = await foodDataProvider.lookupBarcode(code);
  } catch (err) {
    throw new ApiHttpError(
      502,
      "barcode_lookup_failed",
      "Couldn't reach the barcode database — try again, or log this meal manually instead",
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }

  // §8 "barcode.scanned" — a lightweight product-analytics event (not an
  // audit-log entry: nothing was written yet, same reasoning
  // food-estimate creation uses for trackEvent vs. recordAudit).
  await trackEvent(userId, "barcode.scanned", { barcode: code }, { metadata: { found: result.found } });

  return result;
}
