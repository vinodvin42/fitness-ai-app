import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";
import { generateCompletion, isAiConfigured } from "../../lib/aiClient";

/**
 * Meal-Plan Generation Engine (22 Sep 2026).
 *
 * The nutrition sibling of the workout Plan-Generation / Recommendation
 * Engine (`apps/api/src/modules/plans/plans.service.ts` — read that file's
 * own top-of-file doc comment first; this mirrors its exact architecture
 * rather than inventing a new AI-calling pattern). That engine exists
 * because Recipe/MealLog/OnboardingProfile.dietType are all real, but
 * nothing generated a personalized multi-day MEAL plan from them before
 * this pass — Fuel's dashboard only ever supported ad-hoc single-meal
 * logging (nutrition.service.ts) or AI-estimated single-meal macros
 * (FoodEstimate), never a forward-looking schedule.
 *
 * **Real design decision made, not left implicit (same discipline
 * plans.service.ts's own comment applies to Program selection):** a
 * MealPlan is an AI-driven SELECTION of real, existing, admin-authored
 * `Recipe` rows into a day-by-day, meal-slot-by-meal-slot schedule —
 * never AI-authored/free-text meal content. The LLM is asked to answer in
 * a strict, parseable format, and every recipe id it names is validated
 * against the real eligible-Recipe catalog (filtered to the correct meal
 * slot) before being trusted. An unparseable answer, or one naming a
 * recipe id that doesn't exist (or exists but is the wrong meal type) is
 * a real, honest `failed` state — never silently coerced into some plan,
 * and never a fabricated recipe invented by the model.
 *
 * **Why 7 days, breakfast/lunch/dinner/snack (not a configurable input):**
 * matches Fuel's own MEAL_TYPES constant (FuelScreen.tsx) and the real
 * `MealType` enum's full four values — a week is the smallest span that
 * actually reads as a "plan" rather than a single day's log, and is the
 * span `docs/mobile/03-screen-inventory.md` §D names for "Meal Plan"
 * without giving a specific number. Making duration user-configurable is
 * real future scope, not attempted here (same "don't invent past the
 * spec" discipline as plans.service.ts's own "what this pass deliberately
 * does NOT attempt" section) — `MealPlan.durationDays` is a real column
 * precisely so a future variable-length caller doesn't need a schema
 * change.
 *
 * **Why a new `MealPlan`/`MealPlanItem` model pair instead of reusing
 * `Plan`:** see the schema.prisma doc comment directly above `MealPlan`
 * for the full reasoning — short version, `Plan` is shaped around exactly
 * one selected `Program`, and a meal plan is fundamentally an ordered SET
 * of Recipe picks with no single-entity home to overload.
 */

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealPlanMealType = (typeof MEAL_TYPES)[number];
const DURATION_DAYS = 7;

interface MealPlanItemDTO {
  id: string;
  dayNumber: number;
  mealType: MealPlanMealType;
  recipeId: string;
  recipeName: string;
  recipeImageUrl: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MealPlanDTO {
  id: string;
  version: number;
  status: "generating" | "generated" | "failed";
  durationDays: number;
  rationale: string | null;
  failureReason: string | null;
  isActive: boolean;
  createdAt: Date;
  items: MealPlanItemDTO[];
}

type MealPlanRow = {
  id: string;
  userId: string;
  version: number;
  status: string;
  durationDays: number;
  rationale: string | null;
  failureReason: string | null;
  isActive: boolean;
  createdAt: Date;
};

type EligibleRecipe = {
  id: string;
  name: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  tags: string[];
  imageUrl: string | null;
};

function toMealPlanDTO(p: MealPlanRow, items: MealPlanItemDTO[]): MealPlanDTO {
  return {
    id: p.id,
    version: p.version,
    status: p.status as MealPlanDTO["status"],
    durationDays: p.durationDays,
    rationale: p.rationale,
    failureReason: p.failureReason,
    isActive: p.isActive,
    createdAt: p.createdAt,
    items,
  };
}

async function eligibleRecipes(): Promise<EligibleRecipe[]> {
  return prisma.recipe.findMany({
    where: { status: "published" },
    select: { id: true, name: true, mealType: true, calories: true, proteinG: true, carbsG: true, fatG: true, tags: true, imageUrl: true },
    orderBy: { createdAt: "asc" },
  });
}

function recipeCatalogText(recipes: EligibleRecipe[]): string {
  return MEAL_TYPES.map((mt) => {
    const forSlot = recipes.filter((r) => r.mealType === mt);
    if (forSlot.length === 0) return `${mt.toUpperCase()}: (no published recipes available for this slot)`;
    const lines = forSlot
      .map((r) => `  - id: ${r.id} | name: ${r.name} | calories: ${r.calories} | protein: ${r.proteinG}g | carbs: ${r.carbsG}g | fat: ${r.fatG}g | tags: ${r.tags.length ? r.tags.join(", ") : "none"}`)
      .join("\n");
    return `${mt.toUpperCase()}:\n${lines}`;
  }).join("\n\n");
}

/**
 * Same "ground it, then validate before trusting it" discipline
 * plans.service.ts's own buildSelectionPrompt establishes — applied here
 * to a 7-day x 4-meal-slot grid instead of a single Program pick.
 */
function buildMealPlanPrompt(
  profile: { dietType: string | null; allergens: string[]; goals: string[] },
  recipes: EligibleRecipe[],
): string {
  const diet = profile.dietType ?? "not specified — no diet-type self-report on file, so don't assume either way";
  const allergens = profile.allergens.length ? profile.allergens.join(", ") : "none reported";
  const goals = profile.goals.length ? profile.goals.join(", ") : "not specified";

  const dayLines = Array.from({ length: DURATION_DAYS }, (_, i) => i + 1)
    .map((day) => MEAL_TYPES.map((mt) => `DAY_${day}_${mt.toUpperCase()}: <the exact id of your chosen recipe for Day ${day} ${mt}>`).join("\n"))
    .join("\n");

  return [
    `You are building a real ${DURATION_DAYS}-day meal plan for a fitness app user by selecting from a fixed recipe catalog — you are not inventing new recipes or free-text meals.`,
    `User's stated diet type: ${diet}. Reported allergens/foods to avoid: ${allergens}. Stated goals: ${goals}.`,
    "Available recipes, grouped by meal slot (choose exactly one id from the matching slot's list for each day/slot below — never invent an id, and never place a recipe under the wrong meal slot):",
    recipeCatalogText(recipes),
    "For each day and meal slot, pick the single best-fitting recipe given the user's diet type, allergens, and goals. If the user reported an allergen or a diet type (e.g. vegan, vegetarian, pescatarian) that a recipe's tags conflict with, avoid that recipe in favor of a safer real option from the same slot's list. You may repeat a recipe across different days if the catalog for a slot is small — that is honest, not a failure.",
    `Respond in EXACTLY this format, ${DURATION_DAYS * MEAL_TYPES.length} lines followed by one rationale line, nothing else:`,
    dayLines,
    "RATIONALE: <2-3 sentences explaining the overall selection, referencing the user's actual diet type/allergens/goals above — never a generic template>",
  ].join("\n\n");
}

interface ParsedMealPlan {
  picks: Array<{ dayNumber: number; mealType: MealPlanMealType; recipeId: string }>;
  rationale: string;
}

function parseMealPlan(raw: string, recipesBySlot: Map<MealPlanMealType, Set<string>>): ParsedMealPlan | null {
  const rationaleMatch = raw.match(/RATIONALE:\s*([\s\S]+)/i);
  if (!rationaleMatch) return null;
  const rationale = rationaleMatch[1].trim();
  if (rationale.length === 0) return null;

  const picks: ParsedMealPlan["picks"] = [];
  for (let day = 1; day <= DURATION_DAYS; day++) {
    for (const mealType of MEAL_TYPES) {
      const key = `DAY_${day}_${mealType.toUpperCase()}`;
      const match = raw.match(new RegExp(`${key}:\\s*(\\S+)`, "i"));
      if (!match) return null;
      const recipeId = match[1].trim();
      const eligibleIds = recipesBySlot.get(mealType);
      if (!eligibleIds || !eligibleIds.has(recipeId)) return null;
      picks.push({ dayNumber: day, mealType, recipeId });
    }
  }
  return { picks, rationale };
}

async function failMealPlan(mealPlanId: string, failureReason: string): Promise<MealPlanRow> {
  return prisma.mealPlan.update({ where: { id: mealPlanId }, data: { status: "failed", failureReason } }) as Promise<MealPlanRow>;
}

async function itemsWithRecipes(mealPlanId: string, recipesById: Map<string, EligibleRecipe>): Promise<MealPlanItemDTO[]> {
  const items = await prisma.mealPlanItem.findMany({
    where: { mealPlanId },
    orderBy: [{ dayNumber: "asc" }, { mealType: "asc" }],
  });
  return items.map((it) => {
    const recipe = recipesById.get(it.recipeId);
    return {
      id: it.id,
      dayNumber: it.dayNumber,
      mealType: it.mealType as MealPlanMealType,
      recipeId: it.recipeId,
      recipeName: recipe?.name ?? "Unknown recipe",
      recipeImageUrl: recipe?.imageUrl ?? null,
      calories: recipe?.calories ?? 0,
      proteinG: recipe?.proteinG ?? 0,
      carbsG: recipe?.carbsG ?? 0,
      fatG: recipe?.fatG ?? 0,
    };
  });
}

/** Generates a brand-new MealPlan (a new version) for the user, calling the real LLM and validating every pick against the real Recipe catalog. Requires a completed OnboardingProfile — same gate plans.service.ts's generatePlan applies, since this reads the same real profile (dietType/allergens/goals) as its grounding input. */
export async function generateMealPlan(userId: string): Promise<MealPlanDTO> {
  if (!isAiConfigured()) {
    throw new ApiHttpError(
      503,
      "meal_plan_generation_not_configured",
      "Meal-plan generation isn't configured on this server yet — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or the AZURE_OPENAI_* trio",
    );
  }

  const profile = await prisma.onboardingProfile.findUnique({ where: { userId } });
  if (!profile || !profile.completedAt) {
    throw new ApiHttpError(400, "assessment_incomplete", "Complete your assessment before generating a meal plan");
  }

  const recipes = await eligibleRecipes();
  const missingSlots = MEAL_TYPES.filter((mt) => !recipes.some((r) => r.mealType === mt));

  const lastVersion = await prisma.mealPlan.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (lastVersion?.version ?? 0) + 1;

  const mealPlanRow = (await prisma.mealPlan.create({
    data: { userId, version, status: "generating", durationDays: DURATION_DAYS },
  })) as MealPlanRow;

  await trackEvent(userId, "meal_plan.generation_started", { mealPlanId: mealPlanRow.id }, { metadata: { version } });

  if (missingSlots.length > 0) {
    const failed = await failMealPlan(
      mealPlanRow.id,
      `No published recipes are available for: ${missingSlots.join(", ")} — can't build a full ${DURATION_DAYS}-day plan right now`,
    );
    await recordAudit({
      actorId: userId,
      action: "meal_plan.generation_failed",
      entityType: "MealPlan",
      entityId: mealPlanRow.id,
      metadata: { reason: "empty_catalog_slot", missingSlots },
    });
    await trackEvent(userId, "meal_plan.generation_failed", { mealPlanId: mealPlanRow.id }, { metadata: { reason: "empty_catalog_slot" } });
    return toMealPlanDTO(failed, []);
  }

  let raw: string;
  try {
    raw = await generateCompletion(
      buildMealPlanPrompt({ dietType: profile.dietType, allergens: profile.allergens, goals: profile.goals }, recipes),
    );
  } catch {
    const failed = await failMealPlan(mealPlanRow.id, "The meal-plan generation service didn't respond — try again in a moment");
    await recordAudit({
      actorId: userId,
      action: "meal_plan.generation_failed",
      entityType: "MealPlan",
      entityId: mealPlanRow.id,
      metadata: { reason: "upstream_error" },
    });
    await trackEvent(userId, "meal_plan.generation_failed", { mealPlanId: mealPlanRow.id }, { metadata: { reason: "upstream_error" } });
    return toMealPlanDTO(failed, []);
  }

  const recipesBySlot = new Map<MealPlanMealType, Set<string>>(
    MEAL_TYPES.map((mt) => [mt, new Set(recipes.filter((r) => r.mealType === mt).map((r) => r.id))]),
  );
  const parsed = parseMealPlan(raw, recipesBySlot);
  if (!parsed) {
    const failed = await failMealPlan(mealPlanRow.id, "The meal-plan generation service returned an unusable response");
    await recordAudit({
      actorId: userId,
      action: "meal_plan.generation_failed",
      entityType: "MealPlan",
      entityId: mealPlanRow.id,
      metadata: { reason: "unparseable_response" },
    });
    await trackEvent(userId, "meal_plan.generation_failed", { mealPlanId: mealPlanRow.id }, { metadata: { reason: "unparseable_response" } });
    return toMealPlanDTO(failed, []);
  }

  await prisma.$transaction([
    prisma.mealPlan.update({
      where: { id: mealPlanRow.id },
      data: { status: "generated", rationale: parsed.rationale, isActive: true },
    }),
    prisma.mealPlanItem.createMany({
      data: parsed.picks.map((pick) => ({
        mealPlanId: mealPlanRow.id,
        dayNumber: pick.dayNumber,
        mealType: pick.mealType,
        recipeId: pick.recipeId,
      })),
    }),
    // Deactivate every OTHER meal plan this user has — same "exactly one
    // active row at a time" convention as Plan.isActive.
    prisma.mealPlan.updateMany({
      where: { userId, id: { not: mealPlanRow.id }, isActive: true },
      data: { isActive: false },
    }),
  ]);

  await recordAudit({
    actorId: userId,
    action: "meal_plan.activated",
    entityType: "MealPlan",
    entityId: mealPlanRow.id,
    metadata: { version },
  });

  await trackEvent(userId, "meal_plan.generated", { mealPlanId: mealPlanRow.id });
  await trackEvent(userId, "meal_plan.activated", { mealPlanId: mealPlanRow.id }, { metadata: { version } });

  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const generated = (await prisma.mealPlan.findUniqueOrThrow({ where: { id: mealPlanRow.id } })) as MealPlanRow;
  const items = await itemsWithRecipes(mealPlanRow.id, recipesById);
  return toMealPlanDTO(generated, items);
}

export async function getCurrentMealPlan(userId: string): Promise<MealPlanDTO | null> {
  const mealPlan = (await prisma.mealPlan.findFirst({ where: { userId, isActive: true } })) as MealPlanRow | null;
  if (!mealPlan) return null;

  const items = await prisma.mealPlanItem.findMany({
    where: { mealPlanId: mealPlan.id },
    orderBy: [{ dayNumber: "asc" }, { mealType: "asc" }],
  });
  const recipeIds = [...new Set(items.map((it) => it.recipeId))];
  const recipes = recipeIds.length
    ? await prisma.recipe.findMany({
        where: { id: { in: recipeIds } },
        select: { id: true, name: true, mealType: true, calories: true, proteinG: true, carbsG: true, fatG: true, tags: true, imageUrl: true },
      })
    : [];
  const recipesById = new Map(recipes.map((r) => [r.id, r as EligibleRecipe]));
  const itemDTOs = items.map((it) => {
    const recipe = recipesById.get(it.recipeId);
    return {
      id: it.id,
      dayNumber: it.dayNumber,
      mealType: it.mealType as MealPlanMealType,
      recipeId: it.recipeId,
      recipeName: recipe?.name ?? "Unknown recipe",
      recipeImageUrl: recipe?.imageUrl ?? null,
      calories: recipe?.calories ?? 0,
      proteinG: recipe?.proteinG ?? 0,
      carbsG: recipe?.carbsG ?? 0,
      fatG: recipe?.fatG ?? 0,
    };
  });
  return toMealPlanDTO(mealPlan, itemDTOs);
}
