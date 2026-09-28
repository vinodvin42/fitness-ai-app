import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { extractErrorMessage } from "../../lib/apiError";
import { resetPasswordRequest } from "../../api/auth";
import { colors, layout, radius, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "ResetPassword">;

/**
 * Reset Password (R1 Developer 1, 18 Sep 2026, gap §53) — reached from
 * SplashScreen when a `fynrox://reset-password?token=...` deep link
 * was captured (see src/lib/resetPasswordLink.ts and SplashScreen.tsx's
 * own effect). `route.params.token` is the raw token; the server hashes
 * it and looks up the real, unexpired, unused match (POST
 * /auth/reset-password) — an invalid/expired/already-used token comes
 * back as a real error here, not a silent failure.
 */
export function ResetPasswordScreen({ navigation, route }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const onSubmit = async () => {
    if (!passwordsMatch || newPassword.length < 8) return;
    setError(null);
    setLoading(true);
    try {
      await resetPasswordRequest({ token: route.params.token, newPassword });
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          "This reset link is invalid or has expired — request a new one.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose a new password for your account.</Text>

        <TextInput
          style={styles.input}
          placeholder="New password (min. 8 characters)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoFocus
          value={newPassword}
          onChangeText={setNewPassword}
          accessibilityLabel="New password, minimum 8 characters"
          textContentType="newPassword"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          accessibilityLabel="Confirm new password"
          textContentType="newPassword"
        />

        {confirmPassword.length > 0 && !passwordsMatch ? (
          <Text style={styles.error}>Passwords don't match.</Text>
        ) : null}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label="Reset Password"
          onPress={onSubmit}
          loading={loading}
          disabled={!passwordsMatch || newPassword.length < 8}
        />
        <Button
          label="Back to Login"
          variant="secondary"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: "Login" }] })}
          style={styles.secondaryButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  input: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
  error: { color: colors.danger, ...typography.meta },
  secondaryButton: { marginTop: spacing.sm },
});
