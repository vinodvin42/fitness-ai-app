import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreScreen } from "../screens/more/MoreScreen";
import { AvailabilityScreen } from "../screens/more/AvailabilityScreen";
import { EarningsScreen } from "../screens/earnings/EarningsScreen";
import { OffersScreen } from "../screens/clients/OffersScreen";

/**
 * More tab (R2 Wave 2, 20 Sep 2026) — replaces the inline `ComingSoonScreen`
 * MainTabs.tsx used to render directly for this tab. Same shape as
 * ClientsStack/MessagesStack: header hidden here, each screen renders its
 * own ScreenContainer title and back affordance.
 */
export type MoreStackParamList = {
  MoreMenu: undefined;
  AvailabilityCapacity: undefined;
  /** P6 — the earnings surface, absent from this app until R1. */
  Earnings: undefined;
  /** P-M7 — offers list, with decline reasons and expiry. */
  Offers: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator initialRouteName="MoreMenu" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} />
      <Stack.Screen name="AvailabilityCapacity" component={AvailabilityScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
    </Stack.Navigator>
  );
}
