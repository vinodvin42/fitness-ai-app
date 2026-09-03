import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

/** docs/coach/03-screen-inventory.md §A "Coach Login" — email/password (no Google SSO configured, same "plain functional auth" precedent as every other app in this build). */
export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome back, Coach</Text>
        <Text style={styles.subtitle}>Log in to manage your clients.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Log In" onPress={onSubmit} loading={loading} disabled={!email || !password} />
        <Button
          label="Create an account"
          variant="secondary"
          onPress={() => navigation.navigate("Signup")}
          style={styles.secondaryButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  input: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  error: { color: colors.danger, ...typography.meta },
  secondaryButton: { marginTop: spacing.sm },
});
