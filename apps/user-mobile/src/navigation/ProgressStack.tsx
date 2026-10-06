import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Recommendation } from "@fitness-ai-app/types";
import { ProgressOverviewScreen } from "../screens/more/ProgressOverviewScreen";
import { LogMeasurementScreen } from "../screens/more/LogMeasurementScreen";
import { MeasurementHistoryScreen } from "../screens/more/MeasurementHistoryScreen";
import { StreakTrackerScreen } from "../screens/more/StreakTrackerScreen";
import { ProgressPhotosScreen } from "../screens/more/ProgressPhotosScreen";
import { CheckInScreen } from "../screens/more/CheckInScreen";
import { BodyCompositionScreen } from "../screens/progress/BodyCompositionScreen";
import { ProgressReviewScreen } from "../screens/progress/ProgressReviewScreen";
import { WhyThisChangedScreen } from "../screens/progress/WhyThisChangedScreen";
import { ProgressInsightsScreen } from "../screens/progress/ProgressInsightsScreen";

// R1 Developer 1 work package, U1 (14 Sep 2026) — the primary nav BR-USR-001
// requires is Today | Train | Fuel | Progress | More, with Recovery
// contextual rather than a primary tab (BR-USR-002). This app's own prior
// nav (see MainTabs.tsx's own comment, now superseded) had Recover as a
// tab and Progress buried three screens deep inside MoreStack — the exact
// opposite of both rules. This stack is that fix: the same five real
// screens that already existed under MoreStack (Progress/LogMeasurement/
// MeasurementHistory/StreakTracker/ProgressPhotos, all real, unchanged),
// promoted to their own top-level tab stack rather than nested inside
// More. Screen files themselves are untouched — only which stack owns
// them and their Props type import changed (MoreStackParamList ->
// ProgressStackParamList).
//
// U5 (15 Sep 2026) — two new real screens added, both consuming the
// Recommendation half of apps/api's Plan-Generation / Recommendation
// Engine (`plans.service.ts`), which — like its sibling Plan half before
// U3 (see docs/mobile/07-open-questions-gaps.md §44) — had zero mobile
// consumer until now. `ProgressReview` is the new periodic/reflective
// screen this milestone names (§4): a step back from day-to-day logging
// (the existing `Progress` dashboard above) to "here's what you've done
// lately, and here's what your plan suggests." `WhyThisChanged` is where
// a live Recommendation is actually reviewed — Accept / Decline / Modify,
// mapping onto the real server-side `decideRecommendation` states. It
// takes the whole `Recommendation` as an optional nav param (same
// "already have it, don't refetch" convention `ConfirmFoodEstimateScreen`
// already established) so `ProgressReview` can hand off a
// freshly-generated one directly; reachable with no param too (fetches
// the current one itself) for a future direct entry point.
export type ProgressStackParamList = {
  Progress: undefined;
  LogMeasurement: undefined;
  MeasurementHistory: undefined;
  StreakTracker: undefined;
  ProgressPhotos: undefined;
  // U5 (15 Sep 2026) — the required "Daily / weekly Check-In" screen, see
  // CheckInScreen's own doc comment.
  CheckIn: undefined;
  ProgressReview: undefined;
  // More menu "Body Composition" (Figma Today 05) — weight / body-fat / waist / hips trends.
  BodyComposition: undefined;
  WhyThisChanged: { recommendation?: Recommendation } | undefined;
  // Figma Progress 07 - rule-based insight cards.
  ProgressInsights: undefined;
};

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Progress" component={ProgressOverviewScreen} />
      <Stack.Screen name="BodyComposition" component={BodyCompositionScreen} />
      <Stack.Screen name="LogMeasurement" component={LogMeasurementScreen} />
      <Stack.Screen name="MeasurementHistory" component={MeasurementHistoryScreen} />
      <Stack.Screen name="StreakTracker" component={StreakTrackerScreen} />
      <Stack.Screen name="ProgressPhotos" component={ProgressPhotosScreen} />
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
      <Stack.Screen name="ProgressReview" component={ProgressReviewScreen} />
      <Stack.Screen name="WhyThisChanged" component={WhyThisChangedScreen} />
      <Stack.Screen name="ProgressInsights" component={ProgressInsightsScreen} />
    </Stack.Navigator>
  );
}
