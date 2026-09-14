import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProgressOverviewScreen } from "../screens/more/ProgressOverviewScreen";
import { LogMeasurementScreen } from "../screens/more/LogMeasurementScreen";
import { MeasurementHistoryScreen } from "../screens/more/MeasurementHistoryScreen";
import { StreakTrackerScreen } from "../screens/more/StreakTrackerScreen";
import { ProgressPhotosScreen } from "../screens/more/ProgressPhotosScreen";

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
export type ProgressStackParamList = {
  Progress: undefined;
  LogMeasurement: undefined;
  MeasurementHistory: undefined;
  StreakTracker: undefined;
  ProgressPhotos: undefined;
};

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Progress" component={ProgressOverviewScreen} />
      <Stack.Screen name="LogMeasurement" component={LogMeasurementScreen} />
      <Stack.Screen name="MeasurementHistory" component={MeasurementHistoryScreen} />
      <Stack.Screen name="StreakTracker" component={StreakTrackerScreen} />
      <Stack.Screen name="ProgressPhotos" component={ProgressPhotosScreen} />
    </Stack.Navigator>
  );
}
