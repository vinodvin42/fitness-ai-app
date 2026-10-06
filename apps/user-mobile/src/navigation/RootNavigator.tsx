import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import * as Notifications from "expo-notifications";
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import { todayAtIso } from "../lib/medicationReminder";
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

const navigationRef = createNavigationContainerRef<{ More: { screen: string; params: object } }>();

type OccurrenceTarget = { medicationId: string; scheduledFor: string };

/** Maps a tapped medicine notification (data tagged in medicationNotifications.ts) to an occurrence screen. */
function occurrenceFromData(data: Record<string, unknown> | undefined): OccurrenceTarget | null {
  if (!data || !String(data.kind ?? "").startsWith("medication")) return null;
  const medicationId = typeof data.medicationId === "string" ? data.medicationId : null;
  if (!medicationId) return null;
  const scheduledFor =
    typeof data.scheduledFor === "string" ? data.scheduledFor : typeof data.time === "string" ? todayAtIso(data.time) : null;
  return scheduledFor ? { medicationId, scheduledFor } : null;
}

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

  // Tapping a medicine notification deep-links to its occurrence screen. A tap that
  // arrives before the user is signed in / unlocked waits until MainTabs is mounted.
  const ready = isAuthenticated && onboardingCompleted && !(isBiometricLockEnabled && !isUnlocked);
  const pending = useRef<OccurrenceTarget | null>(null);
  const checkedColdStart = useRef(false);
  const flush = useCallback(() => {
    if (!ready || !navigationRef.isReady() || !pending.current) return;
    const params = pending.current;
    pending.current = null;
    navigationRef.navigate("More", { screen: "MedicineOccurrence", params });
  }, [ready]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = (response: Notifications.NotificationResponse) => {
      const target = occurrenceFromData(response.notification.request.content.data as Record<string, unknown> | undefined);
      if (target) {
        pending.current = target;
        flush();
      }
    };
    if (!checkedColdStart.current) {
      checkedColdStart.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((r) => (r ? handle(r) : undefined))
        .catch(() => undefined);
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [flush]);
  useEffect(() => {
    flush();
  }, [flush]);

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

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flush}>{content}
    </NavigationContainer>
  );
}
