import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme/tokens";

/**
 * Biometric app-lock gate (docs/mobile/03-screen-inventory.md §L Security
 * — "biometric login"). Rendered directly by RootNavigator (it isn't
 * part of any Stack.Navigator, same top-level treatment as
 * AuthStack/OnboardingStack/MainTabs) whenever Biometric Unlock is
 * turned on and the current app session hasn't passed a Face ID/Touch ID
 * challenge yet — on cold start, and again after the app returns from
 * the background (see AuthContext's AppState listener).
 *
 * This gates access to an ALREADY signed-in session — the access/refresh
 * tokens are already sitting in expo-secure-store, exactly as they are
 * for any returning user. It's a local unlock screen, not a second
 * login, same pattern as a banking app's Face ID lock screen. "Log Out"
 * is offered as an explicit escape hatch (wrong face, no fallback
 * enrolled, etc.) rather than trapping the user behind a failing sensor.
 */
export function LockScreen() {
  const { unlock, logout } = useAuth();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUnlock = async () => {
    setError(null);
    setIsUnlocking(true);
    try {
      const success = await unlock();
      if (!success) setError("Couldn't verify. Try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>23PrimeFit</Text>
        <Text style={styles.subtitle}>Unlock with Face ID or Touch ID to continue.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button label="Unlock" onPress={onUnlock} loading={isUnlocking} />
        <Button label="Log Out" variant="secondary" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "space-between" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  logo: { ...typography.metricLarge, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: "center" },
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
});
