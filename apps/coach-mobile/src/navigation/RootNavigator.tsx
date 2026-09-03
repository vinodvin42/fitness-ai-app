import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { AuthStack } from "./AuthStack";
import { OnboardingStack } from "./OnboardingStack";
import { MainTabs } from "./MainTabs";
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

/**
 * Three-way switch: signed out -> AuthStack, signed in but hasn't selected
 * a service yet -> OnboardingStack, otherwise -> MainTabs. No LockScreen
 * step here (see AuthContext's own doc comment on why biometric lock was
 * deliberately not replicated for this first slice).
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
    content = <MainTabs />;
  }

  return <NavigationContainer theme={navigationTheme}>{content}</NavigationContainer>;
}
