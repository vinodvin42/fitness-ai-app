import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, layout, radius, spacing, typography, themed } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";
import {
  clearStoredAcquisitionContext,
  describeAcquisitionContext,
  getStoredAcquisitionContext,
  gymCodeFromContext,
} from "../../lib/acquisitionContext";
import { linkPartnerCode } from "../../api/partner";

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
      //
      // A gym invite's code is that gym's partner code: link it now, so My Gym and the gym's
      // workouts are there from the start. Best-effort: an expired or unknown code (or a network
      // blip) leaves the account as it is, and the member can still enter a code in My Gym.
      const gymCode = gymCodeFromContext(acquisitionContext);
      if (gymCode) await linkPartnerCode(gymCode).catch(() => undefined);
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
      {/* Scrolls so the labelled fields still fit above the keyboard on a small phone. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("auth.signup.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.signup.subtitle")}</Text>

        {acquisitionContext && describeAcquisitionContext(acquisitionContext) ? (
          <View style={styles.acquisitionBanner}>
            <Text style={styles.acquisitionBannerText}>{describeAcquisitionContext(acquisitionContext)}</Text>
          </View>
        ) : null}

        {/* A visible label above every field: a placeholder alone vanishes
            as soon as you start typing, leaving no clue what the box was for. */}
        <TextField
          label={t("auth.signup.fullName")}
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          textContentType="name"
        />
        <TextField
          label={t("auth.signup.email")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          textContentType="emailAddress"
        />
        <TextField
          label={t("auth.signup.password")}
          secure
          value={password}
          onChangeText={setPassword}
          accessibilityLabel={t("auth.signup.passwordA11y")}
          textContentType="newPassword"
        />
        <TextField
          label={t("auth.signup.referral")}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  error: { color: colors.dangerText, ...typography.meta },
  secondaryButton: { marginTop: spacing.sm },
  acquisitionBanner: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  acquisitionBannerText: { color: colors.accentText, ...typography.meta },
}));
