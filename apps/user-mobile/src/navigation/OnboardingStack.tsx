import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AboutYouScreen } from "../screens/onboarding/AboutYouScreen";
import { GoalsScreen } from "../screens/onboarding/GoalsScreen";
import { TrainingLevelScreen } from "../screens/onboarding/TrainingLevelScreen";
import { FoodDietScreen } from "../screens/onboarding/FoodDietScreen";
import { SafetyScreen } from "../screens/onboarding/SafetyScreen";
import { OnboardingWizardProvider } from "../context/OnboardingWizardContext";

// docs/mobile/03-screen-inventory.md §A: "A linear, no-back-nav-bar flow" —
// headerShown: false below matches that; back navigation is via the
// WizardLayout footer's own Back button, not a native header chevron.
export type OnboardingStackParamList = {
  AboutYou: undefined;
  Goals: undefined;
  TrainingLevel: undefined;
  FoodDiet: undefined;
  Safety: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <OnboardingWizardProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
        <Stack.Screen name="AboutYou" component={AboutYouScreen} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="TrainingLevel" component={TrainingLevelScreen} />
        <Stack.Screen name="FoodDiet" component={FoodDietScreen} />
        <Stack.Screen name="Safety" component={SafetyScreen} />
      </Stack.Navigator>
    </OnboardingWizardProvider>
  );
}
