import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { AuthStack } from "./AuthStack";
import { OnboardingStack } from "./OnboardingStack";
import { MainTabs } from "./MainTabs";
import { LockScreen } from "../screens/lock/LockScreen";
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
 * Four-way switch: signed out -> AuthStack, signed in but the setup
 * wizard isn't done -> OnboardingStack, signed in + onboarded but
 * Biometric Unlock (§L Security) is on and this session hasn't passed a
 * Face ID/Touch ID challenge yet -> LockScreen, otherwise -> MainTabs.
 * Re-evaluated on every auth/onboarding/lock state change, so finishing
 * the wizard or unlocking drops straight into the next screen with no
 * extra navigation call needed. The lock check only applies once fully
 * onboarded — gating the wizard itself behind Face ID adds nothing.
 */
export function RootNavigator() {
  const { isAuthenticated, isLoading, onboardingCompleted, isBiometricLockEnabled, isUnlocked } = useAuth();

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
  } else if (isBiometricLockEnabled && !isUnlocked) {
    content = <LockScreen />;
  } else {
    content = <MainTabs />;
  }

  return <NavigationContainer theme={navigationTheme}>{content}</NavigationContainer>;
}
