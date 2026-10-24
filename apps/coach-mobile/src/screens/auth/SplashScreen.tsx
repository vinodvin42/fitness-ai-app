import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthLayout } from "../../components/AuthLayout";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Splash">;

/** docs/coach/03-screen-inventory.md §A headline: "Join as a Professional — Create your coaching account to connect with clients." */
export function SplashScreen({ navigation }: Props) {
  const { t } = useTranslation();
  return (
    <AuthLayout showBenefits pinToBottom>
      <Text style={styles.title}>{t("auth.splash.title")}</Text>
      <Text style={styles.tagline}>{t("auth.splash.tagline")}</Text>
      <View style={styles.actions}>
        <Button label={t("auth.splash.createAccount")} onPress={() => navigation.navigate("Signup")} />
        <Button label={t("auth.splash.signIn")} variant="secondary" onPress={() => navigation.navigate("Login")} />
      </View>
      <Text style={styles.note}>{t("auth.layout.reviewNote")}</Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.textPrimary, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6 },
  tagline: { color: colors.textSecondary, fontSize: 16, lineHeight: 23, marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md, textAlign: "center" },
});
