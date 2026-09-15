import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { FoodEstimate, MealType } from "@fitness-ai-app/types";
import { FuelScreen } from "../screens/fuel/FuelScreen";
import { RecipesScreen } from "../screens/fuel/RecipesScreen";
import { RecipeDetailScreen } from "../screens/fuel/RecipeDetailScreen";
import { LogMealScreen } from "../screens/fuel/LogMealScreen";
import { ConfirmFoodEstimateScreen } from "../screens/fuel/ConfirmFoodEstimateScreen";
import { NutritionCalendarScreen } from "../screens/fuel/NutritionCalendarScreen";

// docs/mobile/03-screen-inventory.md §D: Nutrition Dashboard -> Recipes ->
// Recipe Detail -> Log Meal, mirroring the Train tab's stack pattern
// (docs/platform/roadmap.md Phase 1 §C). Barcode Scanner and Meal Plan
// (also §D) aren't built yet — camera and AI-generation gaps respectively.
// Nutrition Dashboard -> Nutrition Calendar (added 19 Aug 2026) — a full
// month grid + compliance/monthly-stats screen, real data (see gap §28 for
// the "compliance" definition used).
// Log Meal -> Confirm Food Estimate (U4, 15 Sep 2026) — the BR-DAT-003
// confirm/edit gate for the new AI-estimate input method. The whole
// FoodEstimate object is passed through the param, not re-fetched by id —
// same "already have it, don't refetch" convention TimelineEvent navigation
// already uses (see packages/types's TimelineEvent doc comment).
export type FuelStackParamList = {
  FuelDashboard: undefined;
  Recipes: undefined;
  RecipeDetail: { recipeId: string };
  LogMeal: { mealType?: MealType } | undefined;
  ConfirmFoodEstimate: { estimate: FoodEstimate };
  NutritionCalendar: undefined;
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
    </Stack.Navigator>
  );
}
