import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RecoverScreen } from "../screens/recover/RecoverScreen";
import { AiCoachScreen } from "../screens/recover/AiCoachScreen";
import { RecoveryScreen } from "../screens/recover/RecoveryScreen";
import { ConnectedDevicesScreen } from "../screens/recover/ConnectedDevicesScreen";
import { AddDeviceScreen } from "../screens/recover/AddDeviceScreen";
import { DevicePairingScreen } from "../screens/recover/DevicePairingScreen";
import { SyncDashboardScreen } from "../screens/recover/SyncDashboardScreen";
import { YogaLibraryScreen } from "../screens/recover/YogaLibraryScreen";
import { RoutineDetailScreen } from "../screens/recover/RoutineDetailScreen";
import { GuidedSessionScreen } from "../screens/recover/GuidedSessionScreen";
import { GuidedBreathingScreen } from "../screens/recover/GuidedBreathingScreen";
import type { ConnectedDeviceKind, HealthProvider } from "@fitness-ai-app/types";

// Recover is a primary tab again, matching the Figma bottom bar
// (Today | Train | Fuel | Recover | More). Progress moved under More
// (MoreStack's "ProgressSection"). This reverses R1 U1 (14 Sep 2026), which
// had demoted Recover per BR-USR-001/002.
export type RecoverStackParamList = {
  RecoverHub: undefined;
  AiCoach: undefined;
  Recovery: undefined;
  // Recover 02-05 (devices) and 06-11 (guided yoga / mobility / breathing).
  ConnectedDevices: undefined;
  AddDevice: undefined;
  DevicePairing: { provider: HealthProvider; kind: ConnectedDeviceKind; name: string };
  SyncDashboard: undefined;
  YogaLibrary: undefined;
  RoutineDetail: { routineId: string };
  GuidedSession: { routineId: string };
  GuidedBreathing: { patternId?: string } | undefined;
};

const Stack = createNativeStackNavigator<RecoverStackParamList>();

export function RecoverStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RecoverHub" component={RecoverScreen} />
      <Stack.Screen name="AiCoach" component={AiCoachScreen} />
      <Stack.Screen name="Recovery" component={RecoveryScreen} />
      <Stack.Screen name="ConnectedDevices" component={ConnectedDevicesScreen} />
      <Stack.Screen name="AddDevice" component={AddDeviceScreen} />
      <Stack.Screen name="DevicePairing" component={DevicePairingScreen} />
      <Stack.Screen name="SyncDashboard" component={SyncDashboardScreen} />
      <Stack.Screen name="YogaLibrary" component={YogaLibraryScreen} />
      <Stack.Screen name="RoutineDetail" component={RoutineDetailScreen} />
      <Stack.Screen name="GuidedSession" component={GuidedSessionScreen} />
      <Stack.Screen name="GuidedBreathing" component={GuidedBreathingScreen} />
    </Stack.Navigator>
  );
}
