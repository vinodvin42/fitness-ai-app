import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout, FieldLabel, PasswordInput, authInputStyle, authStyles } from "../../components/AuthLayout";
import { Button } from "../../components/Button";
import { colors } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

/** docs/coach/03-screen-inventory.md §A "Coach Signup" — full name, email, phone, password/confirm, terms checkbox. Terms checkbox not enforced server-side (no ToS-acceptance field anywhere in this build) — same omission as apps/user-mobile's own signup. */
export function SignupScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const onSubmit = async () => {
    if (!passwordsMatch) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signup({ fullName, email, password, phone: phone.trim() || undefined });
      // A fresh signup always has onboardingCompleted: false, so
      // RootNavigator automatically shows OnboardingStack next.
    } catch (err) {
      setError("Could not create your account — that email may already be taken.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Pressable onPress={() => navigation.navigate("Splash")} accessibilityRole="link" style={authStyles.back}>
        <Text style={authStyles.backText}>{`← ${t("common.back")}`}</Text>
      </Pressable>
      <Text style={authStyles.title}>{t("auth.signup.title")}</Text>
      <Text style={authStyles.subtitle}>{t("auth.signup.subtitle")}</Text>

      <View style={authStyles.field}>
        <FieldLabel>{t("auth.signup.fullName")}</FieldLabel>
        <TextInput style={authInputStyle} autoComplete="name" value={fullName} onChangeText={setFullName} />
      </View>
      <View style={authStyles.field}>
        <FieldLabel>{t("auth.signup.email")}</FieldLabel>
        <TextInput
          style={authInputStyle}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <View style={authStyles.field}>
        <FieldLabel>{t("auth.signup.phone")}</FieldLabel>
        <TextInput style={authInputStyle} autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      </View>
      <View style={authStyles.field}>
        <FieldLabel>{t("auth.signup.password")}</FieldLabel>
        <PasswordInput value={password} onChangeText={setPassword} autoComplete="new-password" />
      </View>
      <View style={authStyles.field}>
        <FieldLabel>{t("auth.signup.confirmPassword")}</FieldLabel>
        <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} autoComplete="new-password" onSubmitEditing={onSubmit} />
      </View>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <Button
        label={t("auth.signup.submit")}
        onPress={onSubmit}
        loading={loading}
        disabled={!fullName || !email || password.length < 8 || !confirmPassword}
        style={authStyles.submit}
      />

      <View style={authStyles.switchRow}>
        <Text style={authStyles.switchText}>{t("auth.signup.haveAccount")}</Text>
        <Pressable onPress={() => navigation.navigate("Login")} accessibilityRole="link">
          <Text style={authStyles.switchLink}>{t("auth.signup.logIn")}</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}
