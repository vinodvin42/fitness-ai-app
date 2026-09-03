import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { colors, layout, radius, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Splash">;

/** docs/mobile/03-screen-inventory.md §A "Splash/Welcome". */
export function SplashScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.mark}>
          <Icon name="zap" size={40} color={colors.textOnAccent} strokeWidth={2.5} />
        </View>
        <Text style={styles.logo}>23PrimeFit</Text>
        <Text style={styles.tagline}>Your complete wellness operating system</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Get Started" onPress={() => navigation.navigate("Signup")} />
        <Button label="Sign In" variant="secondary" onPress={() => navigation.navigate("Login")} />
      </View>
    </SafeAreaView>
  );
}

const column = {
  width: "100%" as const,
  maxWidth: layout.maxContentWidth,
  alignSelf: "center" as const,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "space-between" },
  content: { ...column, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  mark: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logo: { ...typography.display, color: colors.textPrimary },
  tagline: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  actions: { ...column, paddingHorizontal: layout.screenPadding, paddingBottom: spacing.xl, gap: spacing.sm },
});
