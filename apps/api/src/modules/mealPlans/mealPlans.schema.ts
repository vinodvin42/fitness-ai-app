import { z } from "zod";

// Meal-Plan Generation Engine (22 Sep 2026) — see mealPlans.service.ts's
// doc comment for the full design reasoning. There's currently no
// user-supplied input to /meal-plans/generate (unlike
// plans.schema.ts's decideRecommendationSchema) — everything the engine
// needs (dietType, allergens, goals) already lives on the real
// OnboardingProfile, same as plans.service.ts's generatePlan. This file
// exists as the real home for that input the moment one is needed (e.g. a
// future "regenerate excluding this recipe" gap), same precedent as an
// empty-but-present schema file elsewhere in this codebase.
export const generateMealPlanSchema = z.object({}).strict();
export type GenerateMealPlanInput = z.infer<typeof generateMealPlanSchema>;
