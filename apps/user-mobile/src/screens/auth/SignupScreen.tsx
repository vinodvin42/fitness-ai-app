import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { colors, layout, radius, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";
import {
  clearStoredAcquisitionContext,
  describeAcquisitionContext,
  getStoredAcquisitionContext,
} from "../../lib/acquisitionContext";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export function SignupScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // §O "Refer & Invite" — someone else's shared code. Optional, and a
  // mistyped/unrecognized one is silently ignored server-side rather than
  // blocking signup — see apps/api's referrals.service.ts.
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Acquisition-context capture (R1 Developer 1 U1, 14 Sep 2026) — see
  // src/lib/acquisitionContext.ts's own doc comment. Read once on mount;
  // null when the app was opened directly (no gym QR/creator link) or the
  // link wasn't recognized — this banner simply doesn't render then.
  const [acquisitionContext, setAcquisitionContext] = useState<string | null>(null);

  useEffect(() => {
    getStoredAcquisitionContext().then(setAcquisitionContext);
  }, []);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signup({
        fullName,
        email,
        password,
        referralCode: referralCode.trim() || undefined,
        acquisitionContext: acquisitionContext ?? undefined,
      });
      // A fresh signup always has onboardingCompleted: false, so
      // RootNavigator automatically shows OnboardingStack next — no
      // explicit navigation call needed here.
    } catch (err) {
      setError("Could not create your account — that email may already be taken.");
    } finally {
      // Cleared either way — a failed attempt (e.g. email already taken)
      // shouldn't keep re-attaching stale context to whatever the user
      // tries next, and a successful one has already sent it server-side.
      await clearStoredAcquisitionContext();
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t("auth.signup.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.signup.subtitle")}</Text>

        {acquisitionContext && describeAcquisitionContext(acquisitionContext) ? (
          <View style={styles.acquisitionBanner}>
            <Text style={styles.acquisitionBannerText}>{describeAcquisitionContext(acquisitionContext)}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder={t("auth.signup.fullName")}
          placeholderTextColor={colors.textMuted}
          value={fullName}
          onChangeText={setFullName}
          accessibilityLabel={t("auth.signup.fullName")}
        />
        <TextInput
          style={styles.input}
          placeholder={t("auth.signup.email")}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel={t("auth.signup.email")}
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          placeholder={t("auth.signup.password")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          accessibilityLabel={t("auth.signup.passwordA11y")}
          textContentType="newPassword"
        />
        <TextInput
          style={styles.input}
          placeholder={t("auth.signup.referral")}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          value={referralCode}
          onChangeText={setReferralCode}
          accessibilityLabel={t("auth.signup.referralA11y")}
        />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={t("auth.signup.submit")}
          onPress={onSubmit}
          loading={loading}
          disabled={!fullName || !email || password.length < 8}
        />
        <Button
          label={t("auth.signup.haveAccount")}
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
  acquisitionBanner: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  acquisitionBannerText: { color: colors.accent, ...typography.meta },
});
