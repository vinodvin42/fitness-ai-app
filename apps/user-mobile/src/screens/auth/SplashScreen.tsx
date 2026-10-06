import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { BrandMark } from "../../components/BrandMark";
import { colors, layout, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";
import { clearStoredResetPasswordToken, getStoredResetPasswordToken } from "../../lib/resetPasswordLink";

type Props = NativeStackScreenProps<AuthStackParamList, "Splash">;

/** docs/mobile/03-screen-inventory.md §A "Splash/Welcome". */
export function SplashScreen({ navigation }: Props) {
  // Reset Password deep link (18 Sep 2026, gap §53) — Splash is
  // AuthStack's initialRouteName, so it's the first screen that mounts
  // whenever the user is signed out, which is exactly when a real
  // `primefit://reset-password?token=` link (captured in App.tsx, see
  // src/lib/resetPasswordLink.ts) would be opened. `navigate` rather than
  // `reset` so the normal back-to-Splash/Login flow still works if the
  // user backs out of ResetPasswordScreen without completing it.
  useEffect(() => {
    getStoredResetPasswordToken().then((token) => {
      if (!token) return;
      clearStoredResetPasswordToken();
      navigation.navigate("ResetPassword", { token });
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.mark}>
          <BrandMark size={88} />
        </View>
        <Text style={styles.logo}>23PrimeFit</Text>
        <Text style={styles.tagline}>Your complete wellness operating system</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Get Started" onPress={() => navigation.navigate("Signup")} />
        <Pressable
          onPress={() => navigation.navigate("Login")}
          accessibilityRole="button"
          accessibilityLabel="I have an account. Sign In"
          style={styles.signInLink}
        >
          <Text style={styles.signInText}>
            I have an account. <Text style={styles.signInAccent}>Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const column = {
  width: "100%" as const,
  maxWidth: layout.maxContentWidth,
  alignSelf: "center" as const,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "space-between" },
  content: { ...column, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  mark: { marginBottom: spacing.md },
  signInLink: { alignItems: "center", paddingVertical: spacing.sm },
  signInText: { ...typography.body, fontSize: 12, color: colors.textSecondary },
  signInAccent: { color: colors.accent, fontWeight: "600" },
  logo: { ...typography.display, color: colors.textPrimary },
  tagline: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  actions: { ...column, paddingHorizontal: layout.screenPadding, paddingBottom: spacing.xl, gap: spacing.sm },
});
