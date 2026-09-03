import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme/tokens";

interface ScreenContainerProps {
  title: string;
  children?: React.ReactNode;
  scroll?: boolean;
}

/** Shared per-screen header + safe-area shell — copied near-verbatim from apps/user-mobile. */
export function ScreenContainer({ title, children, scroll = true }: ScreenContainerProps) {
  const Wrapper = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Wrapper contentContainerStyle={scroll ? styles.scrollContent : styles.staticContent}>
        {children}
      </Wrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
});
