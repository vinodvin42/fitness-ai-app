import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ClientsListScreen } from "../screens/clients/ClientsListScreen";
import { ClientProfileScreen } from "../screens/clients/ClientProfileScreen";

/**
 * Clients tab (docs/coach/03-screen-inventory.md §D), added 31 Aug 2026 —
 * List → Profile. Header hidden here, same as AuthStack/OnboardingStack;
 * each screen renders its own ScreenContainer title, and ClientProfile
 * provides its own back affordance (the design has no native nav bar).
 */
export type ClientsStackParamList = {
  ClientsList: undefined;
  ClientProfile: { userId: string; fullName: string };
};

const Stack = createNativeStackNavigator<ClientsStackParamList>();

export function ClientsStack() {
  return (
    <Stack.Navigator initialRouteName="ClientsList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientsList" component={ClientsListScreen} />
      <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
    </Stack.Navigator>
  );
}
