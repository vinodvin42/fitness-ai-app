import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { AuthStack } from "./AuthStack";
import { OnboardingStack } from "./OnboardingStack";
import { MainTabs } from "./MainTabs";
import { NotificationsScreen } from "../screens/notifications/NotificationsScreen";
import { colors } from "../theme/tokens";

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.accent,
    text: colors.textPrimary,
  },
};

// The root stack once signed in and onboarded — just `MainTabs` plus one
// sibling screen, `Notifications` (added Wave 3, 20 Sep 2026). Living here,
// one level above the tab bar, is what lets ScreenContainer.tsx's global
// "Alerts" header button call `navigation.navigate("Notifications")` from
// ANY nested screen in ANY of the 5 tabs' own stacks — React Navigation
// walks up the navigator tree to find a route name it can't resolve
// locally, so this doesn't need every nested stack's param list threaded
// with a `Notifications` entry, just this one real registration.
export type RootStackParamList = {
  Main: undefined;
  Notifications: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Three-way switch: signed out -> AuthStack, signed in but hasn't selected
 * a service yet -> OnboardingStack, otherwise -> the real root stack (
 * MainTabs + Notifications). No LockScreen step here (see AuthContext's own
 * doc comment on why biometric lock was deliberately not replicated for
 * this first slice).
 */
export function RootNavigator() {
  const { isAuthenticated, isLoading, onboardingCompleted } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  let content: React.ReactNode;
  if (!isAuthenticated) {
    content = <AuthStack />;
  } else if (!onboardingCompleted) {
    content = <OnboardingStack />;
  } else {
    content = (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: "modal" }} />
      </RootStack.Navigator>
    );
  }

  return <NavigationContainer theme={navigationTheme}>{content}</NavigationContainer>;
}
