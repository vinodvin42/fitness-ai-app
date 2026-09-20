import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreScreen } from "../screens/more/MoreScreen";
import { AvailabilityScreen } from "../screens/more/AvailabilityScreen";

/**
 * More tab (R2 Wave 2, 20 Sep 2026) — replaces the inline `ComingSoonScreen`
 * MainTabs.tsx used to render directly for this tab. Same shape as
 * ClientsStack/MessagesStack: header hidden here, each screen renders its
 * own ScreenContainer title and back affordance.
 */
export type MoreStackParamList = {
  MoreMenu: undefined;
  AvailabilityCapacity: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator initialRouteName="MoreMenu" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} />
      <Stack.Screen name="AvailabilityCapacity" component={AvailabilityScreen} />
    </Stack.Navigator>
  );
}
