import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RecoverScreen } from "../screens/recover/RecoverScreen";
import { AiCoachScreen } from "../screens/recover/AiCoachScreen";
import { RecoveryScreen } from "../screens/recover/RecoveryScreen";

/**
 * The Recover tab — "FynroX R1 — Final Design QA & Build Handoff" §2,
 * decision #1: "Today / Train / Fuel / Recover / More. Progress lives in
 * More, plus a Progress card on Today."
 *
 * This reverses a deliberate earlier decision, so the reasoning matters.
 * On 14 Sep 2026 this app swapped Recover OUT of the tab bar and promoted
 * Progress IN, because the R1 work package's BR-USR-001/BR-USR-002 named
 * that tab set. The handoff explicitly supersedes those two rules —
 * §2 records the consequence in its own words: "BR-USR-001 and BR-USR-002
 * change (Recover becomes a tab, Progress moves to More)" — and the
 * handoff outranks the work package in the stated source-of-truth order.
 * So the swap goes back the other way, and this comment exists so nobody
 * reads the 14 Sep comment alone and swaps it a third time.
 *
 * Progress is NOT deleted or re-nested screen by screen: `ProgressStack`
 * is mounted whole inside `MoreStack`, so every Progress screen keeps its
 * own `ProgressStackParamList` typing and every existing deep link into
 * it still resolves. Only the entry point moved.
 */
export type RecoverStackParamList = {
  RecoverHub: undefined;
  AiCoach: undefined;
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
