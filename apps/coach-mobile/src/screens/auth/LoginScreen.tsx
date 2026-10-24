import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout, FieldLabel, PasswordInput, authInputStyle, authStyles } from "../../components/AuthLayout";
import { Button } from "../../components/Button";
import { colors } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

/** docs/coach/03-screen-inventory.md §A "Coach Login" — email/password (no Google SSO configured, same "plain functional auth" precedent as every other app in this build). */
export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = !!email && !!password;

  const onSubmit = async () => {
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      // AuthProvider flips isAuthenticated -> RootNavigator swaps to
      // OnboardingStack or MainTabs, whichever the account still needs.
    } catch (err) {
      setError("Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Text style={authStyles.title}>{t("auth.login.title")}</Text>
      <Text style={authStyles.subtitle}>{t("auth.login.subtitle")}</Text>

      <View style={authStyles.field}>
        <FieldLabel>{t("auth.login.email")}</FieldLabel>
        <TextInput
          style={authInputStyle}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={onSubmit}
        />
      </View>
      <View style={authStyles.field}>
        <FieldLabel>{t("auth.login.password")}</FieldLabel>
        <PasswordInput value={password} onChangeText={setPassword} onSubmitEditing={onSubmit} autoComplete="password" />
      </View>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <Button label={t("auth.login.submit")} onPress={onSubmit} loading={loading} disabled={!canSubmit} style={authStyles.submit} />

      <View style={authStyles.switchRow}>
        <Text style={authStyles.switchText}>{t("auth.login.newHere")}</Text>
        <Pressable onPress={() => navigation.navigate("Signup")} accessibilityRole="link">
          <Text style={authStyles.switchLink}>{t("auth.login.createAccount")}</Text>
        </Pressable>
      </View>
      <Text style={authStyles.note}>{t("auth.layout.reviewNote")}</Text>
    </AuthLayout>
  );
}
