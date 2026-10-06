import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { TodayScreen } from "../screens/today/TodayScreen";
import { NotificationsScreen } from "../screens/today/NotificationsScreen";
import { SearchScreen } from "../screens/today/SearchScreen";
import { ScheduleScreen } from "../screens/today/ScheduleScreen";

export type TodayStackParamList = {
  TodayHome: undefined;
  Notifications: undefined;
  Search: undefined;
  Schedule: undefined;
};

const Stack = createNativeStackNavigator<TodayStackParamList>();

export function TodayStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TodayHome" component={TodayScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
    </Stack.Navigator>
  );
}
