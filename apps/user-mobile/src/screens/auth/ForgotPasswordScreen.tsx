import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { extractErrorMessage } from "../../lib/apiError";
import { forgotPasswordRequest } from "../../api/auth";
import { colors, layout, radius, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

/**
 * Forgot Password (R1 Developer 1, 18 Sep 2026, gap §53) — the mobile
 * half of account recovery. Reached from LoginScreen. Submits an email
 * to POST /auth/forgot-password, which is deliberately generic —
 * apps/api's auth.service.ts forgotPassword() never reveals whether the
 * email has an account (same discipline login() already applies), so
 * this screen shows the same honest confirmation copy every time a
 * request is submitted, regardless of the outcome. The one thing it DOES
 * surface honestly is `emailSent: false` — when this dev/staging
 * environment has no SMTP configured, the response says so rather than
 * silently claiming an email that was never sent.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await forgotPasswordRequest({ email: email.trim() });
      setEmailSent(result.emailSent);
      setSubmitted(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Something went wrong — try again."));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            {emailSent
              ? `If an account exists for ${email.trim()}, we've sent a link to reset your password. It expires in 30 minutes.`
              : "Your request was recorded, but we couldn't send the email right now. Please try again shortly or contact support."}
          </Text>
          <Button label="Back to Login" onPress={() => navigation.navigate("Login")} style={styles.secondaryButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Forgot password?</Text>
        <Text style={styles.subtitle}>Enter your email and we'll send you a link to reset it.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoFocus
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email"
          textContentType="emailAddress"
        />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button label="Send Reset Link" onPress={onSubmit} loading={loading} disabled={!email.trim()} />
        <Button
          label="Back to Login"
          variant="secondary"
          onPress={() => navigation.navigate("Login")}
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
