import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Splash">;

/** docs/coach/03-screen-inventory.md §A headline: "Join as a Professional — Create your coaching account to connect with clients." */
export function SplashScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>FynroX Coach</Text>
        <Text style={styles.tagline}>Join as a Professional — connect with clients and grow your practice.</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Create Account" onPress={() => navigation.navigate("Signup")} />
        <Button label="Sign In" variant="secondary" onPress={() => navigation.navigate("Login")} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "space-between" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  logo: { ...typography.metricLarge, fontSize: 32, color: colors.textPrimary, textAlign: "center" },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
});
