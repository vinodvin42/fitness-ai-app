import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "TwoFactorChallenge">;

/**
 * §L "Security" — Two-Factor Authentication login step (25 Aug 2026, gap
 * §17). Reached from LoginScreen only when the account has 2FA enabled
 * and the password just verified — `route.params.twoFactorToken` proves
 * that to apps/api (see AuthContext.tsx's completeTwoFactorLogin, POST
 * /auth/2fa/verify). Accepts either a live 6-digit code from the user's
 * authenticator app or one of the 10-character recovery codes shown at
 * enrollment — the server tries both, this screen doesn't need to know
 * which kind was typed.
 */
export function TwoFactorChallengeScreen({ navigation, route }: Props) {
  const { completeTwoFactorLogin } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await completeTwoFactorLogin(route.params.twoFactorToken, code.trim());
      // AuthProvider now has real tokens set -> RootNavigator swaps away
      // from AuthStack on its own.
    } catch (err) {
      setError(extractErrorMessage(err, "Incorrect code. Check your authenticator app and try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Two-factor authentication</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Code"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Verify" onPress={onSubmit} loading={loading} disabled={!code.trim()} />
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
    letterSpacing: 2,
  },
  error: { color: colors.danger, ...typography.meta },
  secondaryButton: { marginTop: spacing.sm },
});
