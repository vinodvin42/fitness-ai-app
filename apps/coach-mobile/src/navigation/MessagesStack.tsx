import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ConversationsListScreen } from "../screens/messages/ConversationsListScreen";
import { ThreadScreen } from "../screens/messages/ThreadScreen";

/**
 * Messages tab (docs/coach/03-screen-inventory.md), added 31 Aug 2026 —
 * Conversations list → Thread. Header hidden (each screen renders its own
 * ScreenContainer title); the Thread provides its own back affordance.
 */
export type MessagesStackParamList = {
  ConversationsList: undefined;
  Thread: { userId: string; fullName: string };
};

const Stack = createNativeStackNavigator<MessagesStackParamList>();

export function MessagesStack() {
  return (
    <Stack.Navigator initialRouteName="ConversationsList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConversationsList" component={ConversationsListScreen} />
      <Stack.Screen name="Thread" component={ThreadScreen} />
    </Stack.Navigator>
  );
}
