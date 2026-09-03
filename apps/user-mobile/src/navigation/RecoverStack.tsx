import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RecoverScreen } from "../screens/recover/RecoverScreen";
import { AiCoachScreen } from "../screens/recover/AiCoachScreen";
import { RecoveryScreen } from "../screens/recover/RecoveryScreen";

// docs/mobile/03-screen-inventory.md §E (Recovery & Devices, still a
// placeholder — see RecoverScreen.tsx) + §H (AI Coach, real as of 25 Aug
// 2026 — see AiCoachScreen.tsx). A real stack rather than a single screen
// now that Recover has two genuinely distinct destinations, mirroring
// MoreStack's Hub -> sub-screen pattern.
export type RecoverStackParamList = {
  RecoverHub: undefined;
  AiCoach: undefined;
  // Recovery & Devices — manual-entry stopgap (31 Aug 2026), see RecoveryScreen.tsx.
  Recovery: undefined;
};

const Stack = createNativeStackNavigator<RecoverStackParamList>();

export function RecoverStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RecoverHub" component={RecoverScreen} />
      <Stack.Screen name="AiCoach" component={AiCoachScreen} />
      <Stack.Screen name="Recovery" component={RecoveryScreen} />
    </Stack.Navigator>
  );
}
