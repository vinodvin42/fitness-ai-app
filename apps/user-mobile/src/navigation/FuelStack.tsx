import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { MealType } from "@fitness-ai-app/types";
import { FuelScreen } from "../screens/fuel/FuelScreen";
import { RecipesScreen } from "../screens/fuel/RecipesScreen";
import { RecipeDetailScreen } from "../screens/fuel/RecipeDetailScreen";
import { LogMealScreen } from "../screens/fuel/LogMealScreen";
import { NutritionCalendarScreen } from "../screens/fuel/NutritionCalendarScreen";

// docs/mobile/03-screen-inventory.md §D: Nutrition Dashboard -> Recipes ->
// Recipe Detail -> Log Meal, mirroring the Train tab's stack pattern
// (docs/platform/roadmap.md Phase 1 §C). Barcode Scanner and Meal Plan
// (also §D) aren't built yet — camera and AI-generation gaps respectively.
// Nutrition Dashboard -> Nutrition Calendar (added 19 Aug 2026) — a full
// month grid + compliance/monthly-stats screen, real data (see gap §28 for
// the "compliance" definition used).
export type FuelStackParamList = {
  FuelDashboard: undefined;
  Recipes: undefined;
  RecipeDetail: { recipeId: string };
  LogMeal: { mealType?: MealType } | undefined;
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
      <Stack.Screen name="NutritionCalendar" component={NutritionCalendarScreen} />
    </Stack.Navigator>
  );
}
