import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AboutYouScreen } from "../screens/onboarding/AboutYouScreen";
import { ScheduleScreen } from "../screens/onboarding/ScheduleScreen";
import { GoalsScreen } from "../screens/onboarding/GoalsScreen";
import { TrainingLevelScreen } from "../screens/onboarding/TrainingLevelScreen";
import { EquipmentScreen } from "../screens/onboarding/EquipmentScreen";
import { FoodDietScreen } from "../screens/onboarding/FoodDietScreen";
import { SafetyScreen } from "../screens/onboarding/SafetyScreen";
import { AssessmentSummaryScreen } from "../screens/onboarding/AssessmentSummaryScreen";
import { PlanGeneratingScreen } from "../screens/onboarding/PlanGeneratingScreen";
import { OnboardingWizardProvider, useOnboardingWizard } from "../context/OnboardingWizardContext";
import { colors } from "../theme/tokens";

// docs/mobile/03-screen-inventory.md §A: "A linear, no-back-nav-bar flow" —
// headerShown: false below matches that; back navigation is via the
// WizardLayout footer's own Back button, not a native header chevron.
//
// U2 (15 Sep 2026) added AssessmentSummary (the required-but-previously-
// missing review screen) and PlanGenerating (Generating/Generated/Failed/
// Retry — Developer 1's own required Plan screen, wired to apps/api's
// already-built Plan-Generation Engine) after Safety.
//
// 18 Sep 2026 (R1 Developer 1's own R1 work package §4, real gaps #1/#3):
// added Schedule (Availability/schedule self-report, after AboutYou) and
// Equipment (equipment/gym-context self-report, after TrainingLevel) — see
// docs/mobile/07-open-questions-gaps.md §54. Broader Baseline/measurements
// (gap #2) was added to AboutYou itself rather than a new screen — see that
// screen's own doc comment.
export type OnboardingStackParamList = {
  AboutYou: undefined;
  Schedule: undefined;
  Goals: undefined;
  TrainingLevel: undefined;
  Equipment: undefined;
  FoodDiet: undefined;
  Safety: undefined;
  AssessmentSummary: undefined;
  PlanGenerating: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

/**
 * The Navigator's initialRouteName depends on an async secureStore read
 * (OnboardingWizardContext's draft-resume — U2's "in progress / resumable"
 * Assessment state), so it can't be known synchronously on first render.
 * This waits for `isHydrated` before mounting the Navigator at all — same
 * brief-spinner pattern RootNavigator already uses for its own isLoading
 * branch — rather than mounting at a default route and jarringly
 * redirecting a moment later.
 */
function OnboardingNavigator() {
  const { isHydrated, resumeRouteName } = useOnboardingWizard();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={resumeRouteName} screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="AboutYou" component={AboutYouScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="TrainingLevel" component={TrainingLevelScreen} />
      <Stack.Screen name="Equipment" component={EquipmentScreen} />
      <Stack.Screen name="FoodDiet" component={FoodDietScreen} />
      <Stack.Screen name="Safety" component={SafetyScreen} />
      <Stack.Screen name="AssessmentSummary" component={AssessmentSummaryScreen} />
      <Stack.Screen name="PlanGenerating" component={PlanGeneratingScreen} />
    </Stack.Navigator>
  );
}

export function OnboardingStack() {
  return (
    <OnboardingWizardProvider>
      <OnboardingNavigator />
    </OnboardingWizardProvider>
  );
}
