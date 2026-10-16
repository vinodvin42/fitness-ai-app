import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, layout, spacing, typography, themed } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await login({ email, password });
      if (result.twoFactorRequired && result.twoFactorToken) {
        navigation.navigate("TwoFactorChallenge", { twoFactorToken: result.twoFactorToken });
        return;
      }
      // Otherwise AuthProvider already flipped isAuthenticated ->
      // RootNavigator swaps to OnboardingStack or MainTabs on its own.
    } catch (err) {
      setError("Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("auth.login.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.login.subtitle")}</Text>

        {/* Visible labels (not placeholders, which vanish once you type). */}
        <TextField
          label={t("auth.login.email")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          textContentType="emailAddress"
        />
        <TextField
          label={t("auth.login.password")}
          secure
          value={password}
          onChangeText={setPassword}
          textContentType="password"
        />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button label={t("auth.login.submit")} onPress={onSubmit} loading={loading} disabled={!email || !password} />
        <Button
          label={t("auth.login.forgot")}
          variant="secondary"
          onPress={() => navigation.navigate("ForgotPassword")}
          style={styles.secondaryButton}
        />
        <Button
          label={t("auth.login.createAccount")}
          variant="secondary"
          onPress={() => navigation.navigate("Signup")}
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
}));
