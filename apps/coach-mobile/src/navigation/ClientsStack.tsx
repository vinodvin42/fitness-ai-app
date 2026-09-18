import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ClientsListScreen } from "../screens/clients/ClientsListScreen";
import { ClientProfileScreen } from "../screens/clients/ClientProfileScreen";
import { PendingRequestsScreen } from "../screens/clients/PendingRequestsScreen";

/**
 * Clients tab (docs/coach/03-screen-inventory.md §D), added 31 Aug 2026 —
 * List → Profile. Header hidden here, same as AuthStack/OnboardingStack;
 * each screen renders its own ScreenContainer title, and ClientProfile
 * provides its own back affordance (the design has no native nav bar).
 *
 * **16 Sep 2026 (gap §56):** `PendingRequests` added — the real coach-side
 * review gate for `requested` relationships, reached from ClientsList's own
 * banner. See PendingRequestsScreen.tsx's doc comment for why it lives
 * here rather than as its own bottom tab.
 */
export type ClientsStackParamList = {
  ClientsList: undefined;
  ClientProfile: { userId: string; fullName: string };
  PendingRequests: undefined;
};

const Stack = createNativeStackNavigator<ClientsStackParamList>();

export function ClientsStack() {
  return (
    <Stack.Navigator initialRouteName="ClientsList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientsList" component={ClientsListScreen} />
      <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
      <Stack.Screen name="PendingRequests" component={PendingRequestsScreen} />
    </Stack.Navigator>
  );
}
