import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { FoodEstimate, MealType } from "@fitness-ai-app/types";
import { FuelScreen } from "../screens/fuel/FuelScreen";
import { RecipesScreen } from "../screens/fuel/RecipesScreen";
import { RecipeDetailScreen } from "../screens/fuel/RecipeDetailScreen";
import { LogMealScreen } from "../screens/fuel/LogMealScreen";
import { ConfirmFoodEstimateScreen } from "../screens/fuel/ConfirmFoodEstimateScreen";
import { NutritionCalendarScreen } from "../screens/fuel/NutritionCalendarScreen";
import { BarcodeScannerScreen } from "../screens/fuel/BarcodeScannerScreen";
import { MealPlanScreen } from "../screens/fuel/MealPlanScreen";

// docs/mobile/03-screen-inventory.md §D: Nutrition Dashboard -> Recipes ->
// Recipe Detail -> Log Meal, mirroring the Train tab's stack pattern
// (docs/platform/roadmap.md Phase 1 §C). Meal Plan (also §D) isn't built
// yet — a real AI-generation gap. Barcode Scanner (R2 Wave, 22 Sep 2026) IS
// now built — see BarcodeScannerScreen.tsx.
// Nutrition Dashboard -> Nutrition Calendar (added 19 Aug 2026) — a full
// month grid + compliance/monthly-stats screen, real data (see gap §28 for
// the "compliance" definition used).
// Log Meal -> Confirm Food Estimate (U4, 15 Sep 2026) — the BR-DAT-003
// confirm/edit gate for the new AI-estimate input method. The whole
// FoodEstimate object is passed through the param, not re-fetched by id —
// same "already have it, don't refetch" convention TimelineEvent navigation
// already uses (see packages/types's TimelineEvent doc comment).
// Log Meal -> Barcode Scanner -> back to Log Meal (R2 Wave, 22 Sep 2026) —
// a real scan result comes back as `barcodePrefill` on LogMeal's own
// params (BarcodeScannerScreen navigates to the already-on-stack LogMeal
// route, which pops back to it with the new params) rather than a
// forward-only screen, so scanning pre-fills the SAME manual-entry card the
// AI-estimate/manual paths already use — not a second logging screen.
export type BarcodePrefill = {
  name: string;
  brand: string | null;
  servingSize: string | null;
  basis: "serving" | "100g";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type FuelStackParamList = {
  FuelDashboard: undefined;
  Recipes: undefined;
  RecipeDetail: { recipeId: string };
  LogMeal: { mealType?: MealType; barcodePrefill?: BarcodePrefill } | undefined;
  ConfirmFoodEstimate: { estimate: FoodEstimate };
  NutritionCalendar: undefined;
  BarcodeScanner: { mealType: MealType };
  // Meal Plan (22 Sep 2026) — the real AI-generated multi-day meal plan,
  // wired to apps/api's new Meal-Plan Generation Engine. See
  // MealPlanScreen's own doc comment.
  MealPlan: undefined;
};

const Stack = createNativeStackNavigator<FuelStackParamList>();

export function FuelStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FuelDashboard" component={FuelScreen} />
      <Stack.Screen name="Recipes" component={RecipesScreen} />
      <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <Stack.Screen name="LogMeal" component={LogMealScreen} />
      <Stack.Screen name="ConfirmFoodEstimate" component={ConfirmFoodEstimateScreen} />
      <Stack.Screen name="NutritionCalendar" component={NutritionCalendarScreen} />
      <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="MealPlan" component={MealPlanScreen} />
    </Stack.Navigator>
  );
}
