import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, layout, spacing, typography } from "../theme/tokens";

interface ScreenContainerProps {
  title: string;
  /** Optional muted line under the title (e.g. a date or greeting subtitle). */
  subtitle?: string;
  /** Optional right-aligned header slot (e.g. an avatar or action icon). */
  right?: React.ReactNode;
  children?: React.ReactNode;
  scroll?: boolean;
}

/** Shared per-screen header + safe-area shell — every tab screen uses this. */
export function ScreenContainer({ title, subtitle, right, children, scroll = true }: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {scroll ? (
        // contentContainerStyle carries the max-width/centered column + padding.
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        // A plain View ignores contentContainerStyle, so the column styling
        // must go on `style` here (fixed 31 Aug 2026 — scroll={false} screens
        // like Train were rendering full-width, unlike scrolling screens).
        <View style={styles.staticContent}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.meta,
    color: colors.textMuted,
    marginTop: 2,
  },
  scrollContent: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  staticContent: {
    flex: 1,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
  },
});
