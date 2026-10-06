import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreScreen } from "../screens/more/MoreScreen";
import { AvailabilityScreen } from "../screens/more/AvailabilityScreen";
import { FormReviewsListScreen } from "../screens/formReviews/FormReviewsListScreen";
import { FormReviewDetailScreen } from "../screens/formReviews/FormReviewDetailScreen";

/**
 * More tab (R2 Wave 2, 20 Sep 2026) — replaces the inline `ComingSoonScreen`
 * MainTabs.tsx used to render directly for this tab. Same shape as
 * ClientsStack/MessagesStack: header hidden here, each screen renders its
 * own ScreenContainer title and back affordance.
 */
export type MoreStackParamList = {
  MoreMenu: undefined;
  AvailabilityCapacity: undefined;
  FormReviews: undefined;
  FormReviewDetail: { id: string };
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator initialRouteName="MoreMenu" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} />
      <Stack.Screen name="AvailabilityCapacity" component={AvailabilityScreen} />
      <Stack.Screen name="FormReviews" component={FormReviewsListScreen} />
      <Stack.Screen name="FormReviewDetail" component={FormReviewDetailScreen} />
    </Stack.Navigator>
  );
}
